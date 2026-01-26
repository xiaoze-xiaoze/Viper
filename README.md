现有前端（你这个“LLM网页壳”）现在是怎么跑的

- 单页应用：入口在 main.jsx ，直接渲染 App.jsx 。
- 数据都在前端本地：聊天列表、当前聊天、消息内容都存 localStorage ，key 在 App.jsx ：
  - viper.chatState.v2 ：包含 sessions 、 messagesByChatId 、 currentChatId （保存时把 timestamp 转 ISO 字符串，见 App.jsx:L391-L402 ）
  - viper.models 、 viper.selectedModel ：模型列表和当前选中模型（见 App.jsx:L364-L378 ）
- UI 状态流转（核心）：
  - 你输入内容 -> handleSendMessage 里先“乐观更新”：追加一条 user message + 一条空的 assistant message（占位）到当前 chat（见 App.jsx:L536-L572 ）。
  - 然后调用 runChatCompletion 发请求，把 assistant 占位消息的 content 通过流式 delta 不断拼接（见 App.jsx:L457-L534 ）。
  - SSE 解析在 streamOpenAiSse ：按 \n\n 分割事件，找 data: 行，遇到 [DONE] 结束（见 App.jsx:L261-L296 ）。
- 它“默认假设”你接的是 OpenAI 兼容接口：
  - 请求路径固定拼成 baseUrl + /chat/completions （见 App.jsx:L488-L506 ）
  - payload 是 { model, messages, stream: true, temperature, max_tokens } （见 App.jsx:L480-L486 ）
  - 解析 delta 也是按 OpenAI SSE 的 choices[0].delta.content （见 App.jsx:L252-L258 ）
- 其它你后端暂时不用管但要知道的点：
  - provider/type 字段目前只是存着，前端发送请求时并没有用它做分支（模型编辑/新增里有这些字段，但 runChatCompletion 只用 apiBaseUrl/modelId/apiKey/headers/temperature/maxTokens ）。
  - Markdown 渲染 + 代码高亮在 MarkdownMessage （见 App.jsx:L827-L864 ）。
  - 支持中止生成：前端用 AbortController ，点 stop 就 abort() （见 App.jsx:L447-L455 ）。
你准备用 FastAPI + SQLite 写后端：建议的“逻辑分层” 你要做的其实是两条主线，建议分开设计：

1. 推理代理线（Proxy / Gateway） ：对前端暴露一个“OpenAI兼容”的 /chat/completions ，把请求转发到“本地或官方”上游，再把流式响应原样（或半原样）转给前端。
2. 数据持久化线（History / DB） ：把 chat、message、模型配置等持久化到 SQLite，提供 CRUD API 给前端同步。
为了让你现在这个前端几乎不用改，最省事的对接方式是：

- 后端实现 POST /v1/chat/completions （或 /chat/completions ）
- 前端 Settings 里的 API Endpoint 填 http://127.0.0.1:8000/v1 （这样它会拼成 /v1/chat/completions ）
后端（FastAPI）路由应该怎么设计 按“最小可用 + 可扩展”来，你可以这样分：

- OpenAI兼容推理代理
  
  - POST /v1/chat/completions
    - 入参：跟前端 payload 对齐（ model/messages/stream/temperature/max_tokens ）
    - 出参（stream=true）： text/event-stream ，每个 event 一行或多行 data: {...}\n\n ，最后 data: [DONE]\n\n
    - 核心职责：
      1. 校验请求（messages 是数组，每项 role/content）
      2. 选择上游（本地/官方），拼接上游请求（headers、key、base url）
      3. 开启流式转发（边读边写给前端）
- 聊天记录（DB）
  
  - POST /api/chats ：创建 chat（返回 chat_id）
  - GET /api/chats ：聊天列表（id/title/updated_at）
  - GET /api/chats/{chat_id}/messages ：该 chat 的消息
  - POST /api/chats/{chat_id}/messages ：写入一条消息（role/content/status…）
  - PATCH /api/chats/{chat_id} ：改 title
  - DELETE /api/chats/{chat_id} ：删除 chat + 级联 messages
你也可以把“推理”和“写库”绑定在一次请求里（推荐体验更像 ChatGPT）：

- 前端点发送 -> 你后端：
  1. 先写入 user message
  2. 创建一条 assistant message（status=streaming，content=''）
  3. 代理上游流式返回的同时，累计 content（或定期 flush 更新）
  4. 完成后把 assistant message 更新为 status=sent
SQLite 表怎么建（够用且贴近你当前前端结构） 你现在前端数据结构是：

- sessions： {id, title, timestamp}
- messages： {id(uuid), role, content, createdAt, status, error}
对应 SQLite 最直接：

- chats
  
  - id INTEGER PRIMARY KEY
  - title TEXT NOT NULL
  - created_at TEXT NOT NULL（ISO 字符串即可）
  - updated_at TEXT NOT NULL
- messages
  
  - id TEXT PRIMARY KEY（uuid）
  - chat_id INTEGER NOT NULL（外键到 chats.id）
  - role TEXT NOT NULL（'user'/'assistant'/'system'）
  - content TEXT NOT NULL
  - created_at TEXT NOT NULL
  - status TEXT NOT NULL（sent/streaming/error/aborted）
  - error TEXT NOT NULL DEFAULT ''
可选增强（你之后会想要）：

- model （本次用的模型名/id）
- provider （openai/ollama/…）
- request_id （一次生成的追踪 id）
- prompt_tokens/completion_tokens （统计）
SQLite 使用上你只要记住一条： 每个请求自己拿连接/会话，用完就关 ，不要全局共用一个连接对象（尤其是 streaming 时更要注意）。

一个最小例子：从前端发送到后端，再写库，再流式回前端 假设你保持前端不改（仍然打 /chat/completions ），流程可以这样串：

1. 前端点击发送
- 前端已经做了两件事（见 handleSendMessage ）：
  - 本地追加 user 消息
  - 本地追加 assistant 占位消息（content 为空）
  - 然后发请求到 API Endpoint + /chat/completions
2. 后端收到 POST /v1/chat/completions
- 你在后端做三块事：
  - A. 解析 payload（拿到 messages、model、temperature…）
  - B. 写库（可选，但你既然要 SQLite，建议做）：
    - chat 不存在就创建（你可以让前端额外带 chat_id ；如果不带，就后端自己生成一个“临时会话”也行）
    - 写入 user message
    - 准备一条 assistant message（status=streaming）
  - C. 代理上游并 stream 回前端：
    - 读取上游 SSE：拿到每次 delta 文本
    - 立刻 yield 给前端： data: {"choices":[{"delta":{"content":"..."}}]}\n\n
    - 同时把 delta 累加到内存字符串里（或间隔 N 字符更新一次数据库）
    - 结束时写库把 assistant status=sent，并 yield data: [DONE]\n\n
3. 前端收到 SSE
- 前端用 streamOpenAiSse 做解析，只要你后端输出满足这两点就能无缝显示：
  - data: 行是 JSON，且能在 choices[0].delta.content 取到增量
  - 结束时有 data: [DONE]
前后端与数据库“录入/读取”的对接建议（你写起来会很顺）

- 第一阶段（最快跑起来）：只做推理代理 /v1/chat/completions + CORS，让前端把 API Endpoint 指到你的后端；聊天记录仍然用前端 localStorage。
- 第二阶段（开始上 SQLite）：增加 /api/chats 、 /api/chats/{id}/messages 这套 CRUD，然后把前端的 localStorage 替换成：
  - 首次加载：GET chats -> 选中一个 chat -> GET messages
  - 发送消息：POST message(user) -> 调用 chat/completions -> POST/PUT message(assistant)
- 你现在的前端已经有“会话/消息”的数据模型了，后端照着它落库就行；等稳定后再考虑“多用户/鉴权/模型配置是否要落库”。
如果你下一步准备开始写后端，我建议你先把后端的 /v1/chat/completions 输出格式严格对齐前端的 SSE 解析（就是 data: ...\n\n + [DONE] ），这样你一上来就能看到完整链路通了。