**1) 前端需要接的全部接口（按实际代码）**  
接口调用都在 [App.jsx](file:///c:/code/Viper/frontend/src/App.jsx) 里；后端必须返回前端期望的 **camelCase** 字段名。

- **初始化**
  - `GET /api/bootstrap`  
    代码位置：[App.jsx:L171-L203](file:///c:/code/Viper/frontend/src/App.jsx#L171-L203)  
    前端可接受多种返回形态（会用 `unwrapItems` 兼容数组或 `{items: []}`）：
    - `models` 或 `modelConfigs`：数组或 `{items:[...]}`，元素字段至少：`id? number, name string, apiBaseUrl string, source?, type?, modelId?, apiKey?, headers?, temperature?, maxTokens?`
    - `chats` 或 `chatSessions`：数组或 `{items:[...]}`，元素字段必须：`id number, title string, timestamp string(ISO)`  
    - `selectedModel` 或 `selectedModelName`：string
    - `currentChatId`：number（可选）
    - `messagesByChatId`：对象（可选），形如 `{ "12": [message, ...] }`  
      注意：前端会把 `messagesByChatId` 里出现的 chatId 当成“已加载”，不会再去拉取该 chat 的 messages。

- **LLM 对话（走后端转发，上游为 OpenAI 兼容接口）**
  - `POST /api/llm/chat/completions`（SSE stream）  
    代码位置：[App.jsx:L503-L599](file:///c:/code/Viper/frontend/src/App.jsx#L503-L599)  
    请求体（前端发送）包含：
    - `model`：`{ id?, name, apiBaseUrl, type, modelId, apiKey, headers }`
    - `messages`：`[{ role, content }, ...]`
    - `stream`：`true`
    - `temperature`、`max_tokens`
    - `viper`：`{ chat_id, assistant_message_id, mode }`
    
    响应：`text/event-stream`，事件 `data:` 内容需为 OpenAI 风格增量 JSON（前端读取 `choices[0].delta.content`），并以 `data: [DONE]` 结束。

- **Chat 会话**
  - `POST /api/chats`  body：`{ title: string }`  
    代码位置：[App.jsx:L601-L623](file:///c:/code/Viper/frontend/src/App.jsx#L601-L623)  
    返回：可以直接返回 `{id,title,timestamp}`，或 `{ item: {...} }`（前端两种都兼容）
  - `PATCH /api/chats/{chatId}` body：`{ title: string }`  
    代码位置：[App.jsx:L640-L650](file:///c:/code/Viper/frontend/src/App.jsx#L640-L650)、[App.jsx:L940-L955](file:///c:/code/Viper/frontend/src/App.jsx#L940-L955)  
    返回：任意（前端不依赖响应体），建议 `204`
  - `DELETE /api/chats/{chatId}`  
    代码位置：[App.jsx:L893-L915](file:///c:/code/Viper/frontend/src/App.jsx#L893-L915)  
    返回：建议 `204`

- **Message 消息**
  - `GET /api/chats/{chatId}/messages`  
    代码位置：[App.jsx:L404-L435](file:///c:/code/Viper/frontend/src/App.jsx#L404-L435)  
    返回：`[message,...]` 或 `{items:[message,...]}`  
    `message` 字段前端读取：`id, role, content, createdAt, status, error`
  - `POST /api/chats/{chatId}/messages` body：整条 message 对象（前端直接把它 POST 过去）  
    代码位置：[App.jsx:L651-L668](file:///c:/code/Viper/frontend/src/App.jsx#L651-L668)  
    返回：可 `204`（前端不依赖响应体）
  - `PATCH /api/chats/{chatId}/messages/{messageId}` body：`{ content?: string, status?: string, error?: string }`  
    代码位置：[App.jsx:L574-L599](file:///c:/code/Viper/frontend/src/App.jsx#L574-L599)、[App.jsx:L673-L691](file:///c:/code/Viper/frontend/src/App.jsx#L673-L691)  
    返回：可 `204`

- **Model 配置管理（这是“模型列表/设置”，不是 LLM 推理接口）**
  - `POST /api/models` body：model config（见下）  
    代码位置：[App.jsx:L735-L777](file:///c:/code/Viper/frontend/src/App.jsx#L735-L777)  
    返回：可直接返回 model 或 `{item: model}` 或 `{model: model}`
  - `PATCH /api/models/{id}` 或 `PATCH /api/models/by-name/{name}` body：model config（部分/全量都行）  
    代码位置：[App.jsx:L798-L848](file:///c:/code/Viper/frontend/src/App.jsx#L798-L848)
  - `DELETE /api/models/{id}` 或 `DELETE /api/models/by-name/{name}`  
    代码位置：[App.jsx:L871-L891](file:///c:/code/Viper/frontend/src/App.jsx#L871-L891)
  - `PUT /api/models/selected` body：`{ name: string, id?: number }`  
    代码位置：[App.jsx:L437-L459](file:///c:/code/Viper/frontend/src/App.jsx#L437-L459)  
    返回：建议 `204`

---

**2) backend 文件夹建议结构（你现在只有 backend/app/main.py）**  
目标是让你写 FastAPI + SQLite 时“好找代码、好扩展、好测试”。

- `backend/app/main.py`  
  - 创建 FastAPI 实例、挂载静态文件（如果你决定由后端同时提供前端 build）、注册路由、启动/关闭事件
- `backend/app/api/`  
  - `router.py`：统一 include 所有路由（例如 `/api/...`）  
  - `routes/`：按资源拆分  
    - `bootstrap.py`：`GET /api/bootstrap`  
    - `llm.py`：`POST /api/llm/chat/completions`（SSE 转发）  
    - `models.py`：模型 CRUD + selected  
    - `chats.py`：chat CRUD  
    - `messages.py`：messages CRUD（或放进 chats.py 也行）
- `backend/app/schemas/`（Pydantic）  
  - `model_config.py`：ModelConfigIn/Out、SelectedModelIn  
  - `chat.py`：ChatCreate/ChatOut/ChatPatch  
  - `message.py`：MessageIn/MessageOut/MessagePatch  
  - `llm.py`：LLM 转发入参/出参（主要是入参校验）
  - `bootstrap.py`：BootstrapOut
- `backend/app/db/`  
  - `database.py`：SQLite 连接、Session/依赖注入  
  - `tables.py` 或 `models.py`：ORM 表定义（如果你用 SQLAlchemy/SQLModel）  
  - `migrations/`：可选（用 Alembic 才需要）
- `backend/app/repositories/`（或 `crud/`）  
  - 只做“数据库读写”，不放 HTTP 逻辑：`models_repo.py / chats_repo.py / messages_repo.py / settings_repo.py`
- `backend/app/services/`  
  - 放组合逻辑（例如 bootstrap 一次查多张表、拼响应）
- `backend/app/core/`  
  - `config.py`：配置（开发端口、数据目录、CORS 白名单等）  
  - `paths.py`：确定 db 文件放哪里（打包成 exe 时很关键）

---

**3) 建议你写后端 + 学 SQLite 的顺序（最省时间的路径）**

- ① 先把“数据形状”定死：完全按前端字段命名（camelCase），把 `bootstrap/models/chats/messages` 的 JSON 结构写成 Pydantic schema
- ② 先实现数据库最小闭环（不用懂太多 SQLite 高级特性）  
  - 学会：表、主键、索引、外键（可选）、事务、简单查询 `WHERE/ORDER BY/LIMIT`
- ③ 按前端启动路径实现接口  
  - `GET /api/bootstrap` 先返回空：models/chats 空数组也行，让页面不报错  
  - `POST /api/llm/chat/completions` 先不落库也行，先把转发打通（能流式回传）  
  - 再实现 models CRUD（能新增/保存/删除）  
  - 再实现 chats + messages（能创建 chat、插入 message、按 chatId 拉取 messages、patch message）
- ④ 再做“细节质量”  
  - timestamp/createdAt 统一用 ISO 字符串  
  - 删除策略：软删/硬删选一个并保持一致  
  - 错误处理：返回可读的 `text()`（前端会把错误 body 拼进报错信息）
- ⑤ 最后再考虑“exe 形态”的集成：静态文件托管、数据落盘目录、端口选择等（见第 4 点）

---

**4) 打包成 EXE 时，前后端对接 baseURL 怎么选（且不撞端口）**

最稳的方案是：**后端同时提供前端页面（同源）+ API**，这样前端 `VITE_API_BASE_URL` 可以为空，直接走相对路径 `/api/...`，完全避免 CORS 和端口“撞车”问题。

- **开发态（前端 Vite 单独跑）**  
  - `VITE_API_BASE_URL=http://127.0.0.1:8000`（或你选的端口）
- **EXE/生产态（推荐）**  
  - 后端绑定 `127.0.0.1:0`（让系统自动分配空闲端口）  
  - 后端输出实际端口（例如 51327），壳子（Electron/Tauri/你自己的 launcher）打开：`http://127.0.0.1:{port}/`  
  - 前端此时同源访问：`fetch("/api/...")` 生效（你的代码里 `VITE_API_BASE_URL` 为空时就是这个行为）
- **如果你坚持前端用 file:// 打开**（不推荐）  
  - 就必须让前端知道后端端口（固定端口或扫描端口），并且会涉及 CORS/安全策略，复杂度明显上升

---

**5) SQLite 里“模型管理 + 历史会话”建议怎么存（能完美匹配你前端）**

你前端天然把数据分成：models、chats、messages，再加一个“selected model / current chat”的状态。建议 4 张表：

- `model_configs`
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `name TEXT UNIQUE NOT NULL`
  - `api_base_url TEXT NOT NULL`（对应 `apiBaseUrl`）
  - `type TEXT NOT NULL`（默认 `chat.completions`）
  - `model_id TEXT`（对应 `modelId`）
  - `headers TEXT`（存 JSON 字符串，对应 `headers`）
  - `api_key TEXT`（对应 `apiKey`，如果要存）
  - `temperature REAL NULL`
  - `max_tokens INTEGER NULL`
  - `source TEXT NOT NULL DEFAULT 'custom'`
  - `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`
- `chats`
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `title TEXT NOT NULL`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`（对应前端 `timestamp` 用 updated_at 映射即可）
- `messages`
  - `id TEXT PRIMARY KEY`（用前端生成的 uuid，保证 PATCH 能命中）
  - `chat_id INTEGER NOT NULL`（外键到 chats.id）
  - `role TEXT NOT NULL`（`user/assistant`，可允许 `system` 但前端基本不用存）
  - `content TEXT NOT NULL`
  - `created_at TEXT NOT NULL`
  - `status TEXT NOT NULL`（`sent/streaming/error/aborted` 之类，按前端传什么就存什么）
  - `error TEXT NOT NULL DEFAULT ''`
  - 索引：`INDEX messages_chat_created (chat_id, created_at)`
- `app_settings`（单行/多行 KV 都行）
  - `key TEXT PRIMARY KEY`
  - `value TEXT NOT NULL`（JSON 字符串）
  - 至少存：
    - `selectedModelId` 或 `selectedModelName`
    - `currentChatId`（可选）

安全建议（与你的场景强相关）：如果 `apiKey` 要落盘，优先放系统凭据库（Windows Credential Manager / keyring），SQLite 里只放一个引用或加密后的密文；否则用户拿到 db 文件就能直接读取 key。
