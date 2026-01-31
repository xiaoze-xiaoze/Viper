# Viper 项目

## 后端 API 规范

为了将前端与后端数据库及 LLM 服务集成，需要实现以下 API 接口。

### 基础 URL (Base URL)
`http://localhost:8000/api` (或你配置的其他后端端口)

### 1. 模型 API (Models API)
管理可用的 LLM 模型列表。

#### 获取所有模型
- **接口地址**: `GET /models`
- **响应内容**:
  ```json
  [
    { "id": "gpt-4", "name": "GPT-4", "provider": "openai" },
    { "id": "custom-1", "name": "Local Llama 3", "provider": "custom" }
  ]
  ```

#### 添加自定义模型
- **接口地址**: `POST /models`
- **请求体**:
  ```json
  {
    "name": "My Model",
    "api_config": { "endpoint": "...", "key": "..." }
  }
  ```
- **响应内容**: 返回包含 `id` 的新创建模型对象。

#### 删除模型
- **接口地址**: `DELETE /models/:id`
- **响应内容**: 200 OK

---

### 2. 会话 API (Sessions API)
管理存储在数据库中的聊天会话及历史记录。

#### 获取所有会话列表
- **接口地址**: `GET /sessions`
- **响应内容**: 按 `updatedAt` 倒序排列的会话列表。
  ```json
  [
    {
      "id": "s_123",
      "title": "React 帮助",
      "updatedAt": 1715420000000
    }
  ]
  ```

#### 获取单个会话详情
- **接口地址**: `GET /sessions/:id`
- **响应内容**: 包含完整消息记录的会话详情。
  ```json
  {
    "id": "s_123",
    "title": "React 帮助",
    "updatedAt": 1715420000000,
    "messages": [
      { "id": "m_1", "role": "user", "content": "你好", "ts": 1715420000000 },
      { "id": "m_2", "role": "assistant", "content": "你好！", "ts": 1715420005000 }
    ]
  }
  ```

#### 创建新会话
- **接口地址**: `POST /sessions`
- **请求体**:
  ```json
  { "title": "新对话" }
  ```
- **响应内容**: 返回新建的会话对象。

#### 删除会话
- **接口地址**: `DELETE /sessions/:id`
- **响应内容**: 200 OK

#### 更新会话标题
- **接口地址**: `PATCH /sessions/:id`
- **请求体**:
  ```json
  { "title": "新标题" }
  ```
- **响应内容**: 更新后的会话对象。

---

### 3. 聊天 API (Chat API)
处理实时聊天交互。

#### 发送消息并获取流式响应
- **接口地址**: `POST /chat`
- **请求体**:
  ```json
  {
    "sessionId": "s_123",
    "modelId": "gpt-4",
    "content": "解释一下量子计算"
  }
  ```
- **处理流程**:
  1. 将用户消息保存到数据库（关联 `sessionId`）。
  2. 调用 LLM 服务提供商。
  3. 流式返回响应 (Server-Sent Events 或类似机制)。
  4. 将助手 (Assistant) 的完整响应保存到数据库。

- **流式格式 (Stream Format)**:
  标准的 SSE (Server-Sent Events) 格式或行分隔的 JSON (line-delimited JSON)。
