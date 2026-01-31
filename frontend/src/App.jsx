import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import './App.css'

// Initial data generation helpers
function createId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function formatTime(ts) {
  const d = new Date(ts)
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${hh}:${mm}`
}

function titleFromText(text) {
  const cleaned = `${text || ''}`.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New Chat'
  return cleaned.length > 20 ? `${cleaned.slice(0, 20)}…` : cleaned
}

function makeSession(seedTitle = 'New Chat') {
  return {
    id: createId('s'),
    title: seedTitle,
    updatedAt: Date.now(),
    messages: [],
  }
}

function normalizeBaseUrl(baseUrl) {
  return `${baseUrl || ''}`.replace(/\/+$/, '')
}

function makeModel(values) {
  return {
    id: values.id || createId('model'),
    name: values.name || '',
    provider: values.provider || '',
    baseUrl: normalizeBaseUrl(values.baseUrl),
    apiKey: values.apiKey || '',
    model: values.model || '',
    chatCompletionsPath: values.chatCompletionsPath || '/v1/chat/completions',
    headersJson: typeof values.headersJson === 'string' ? values.headersJson : '{}',
    temperature: Number.isFinite(Number(values.temperature)) ? Number(values.temperature) : 0.7,
  }
}

export default function App() {
  const backendUrl = useMemo(
    () =>
      normalizeBaseUrl(
        globalThis?.VIPER?.backendUrl || import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
      ),
    [],
  )

  const [models, setModels] = useState([])
  const [modelId, setModelId] = useState(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [editingModelId, setEditingModelId] = useState(null)

  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Settings form state
  const [modelFormName, setModelFormName] = useState('')
  const [modelFormProvider, setModelFormProvider] = useState('')
  const [modelFormBaseUrl, setModelFormBaseUrl] = useState('')
  const [modelFormApiKey, setModelFormApiKey] = useState('')
  const [modelFormModel, setModelFormModel] = useState('')
  const [modelFormChatCompletionsPath, setModelFormChatCompletionsPath] = useState('/v1/chat/completions')
  const [modelFormHeadersJson, setModelFormHeadersJson] = useState('{}')
  const [modelFormTemperature, setModelFormTemperature] = useState('0.7')

  const [contextMenu, setContextMenu] = useState(null)

  // Context Menu handler
  const handleContextMenu = (e, model) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      model: model
    })
  }

  // Close context menu on click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  const chatScrollRef = useRef(null)
  const modelMenuRef = useRef(null)
  const composerTextareaRef = useRef(null)
  
  // Streaming refs
  const streamingRef = useRef(false)
  const abortControllerRef = useRef(null)
  const readerRef = useRef(null)
  const isAtBottomRef = useRef(true)

  const apiFetch = useCallback(
    async (path, init) => {
      const resp = await fetch(`${backendUrl}${path}`, init)
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`${resp.status} ${resp.statusText}${text ? `\n${text}` : ''}`)
      }
      return resp
    },
    [backendUrl],
  )

  const isoToMs = useCallback((iso) => {
    const ms = Date.parse(`${iso || ''}`)
    return Number.isFinite(ms) ? ms : Date.now()
  }, [])

  const apiConfigToModel = useCallback(
    (cfg) =>
      makeModel({
        id: cfg.id,
        name: cfg.name,
        provider: cfg.provider || '',
        baseUrl: cfg.base_url,
        apiKey: cfg.api_key || '',
        model: cfg.model,
        chatCompletionsPath: cfg.chat_completions_path || '/v1/chat/completions',
        headersJson: JSON.stringify(cfg.extra_headers || {}, null, 2),
        temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.7,
      }),
    [],
  )

  const loadModels = useCallback(async () => {
    const resp = await apiFetch('/api-configs', { method: 'GET' })
    const data = await resp.json()
    const list = Array.isArray(data) ? data : []
    const nextModels = list.map(apiConfigToModel)
    setModels(nextModels)
    setModelId((prev) => {
      if (prev != null && nextModels.some((m) => m.id === prev)) return prev
      return nextModels.length ? nextModels[0].id : null
    })
  }, [apiConfigToModel, apiFetch])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        await loadModels()
      } catch {
        if (!mounted) return
        setModels([])
        setModelId(null)
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [loadModels])

  useEffect(() => {
    if (models.length === 0) {
      if (modelId != null) setModelId(null)
      return
    }
    if (modelId && models.some((m) => m.id === modelId)) return
    setModelId(models[0].id)
  }, [modelId, models])

  const sessionOutToSession = useCallback(
    (s) => ({
      id: s.id,
      title: s.title || 'New Chat',
      apiConfigId: s.api_config_id ?? null,
      updatedAt: isoToMs(s.updated_at),
      messages: [],
    }),
    [isoToMs],
  )

  const messageOutToMessage = useCallback(
    (m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: isoToMs(m.created_at),
    }),
    [isoToMs],
  )

  const loadSessions = useCallback(async () => {
    const resp = await apiFetch('/sessions', { method: 'GET' })
    const data = await resp.json()
    const list = Array.isArray(data) ? data : []
    const nextSessions = list.map(sessionOutToSession)
    setSessions(nextSessions)
    setActiveSessionId((prev) => {
      if (prev != null && nextSessions.some((s) => s.id === prev)) return prev
      return nextSessions.length ? nextSessions[0].id : null
    })
    if (!nextSessions.length) {
      const created = await apiFetch('/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat', api_config_id: modelId ?? null }),
      }).then((r) => r.json())
      const s = sessionOutToSession(created)
      setSessions([s])
      setActiveSessionId(s.id)
    }
  }, [apiFetch, modelId, sessionOutToSession])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        await loadSessions()
      } catch {
        if (!mounted) return
        const fallback = makeSession('New Chat')
        setSessions([fallback])
        setActiveSessionId(fallback.id)
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [loadSessions])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions],
  )

  const hasMessages = (activeSession?.messages?.length || 0) > 0

  useEffect(() => {
    if (typeof activeSessionId !== 'number') return
    let cancelled = false
    const run = async () => {
      try {
        const detail = await apiFetch(`/sessions/${activeSessionId}`, { method: 'GET' }).then((r) => r.json())
        if (cancelled) return
        const nextSession = sessionOutToSession(detail.session)
        const nextMessages = Array.isArray(detail.messages) ? detail.messages.map(messageOutToMessage) : []
        nextSession.messages = nextMessages
        setSessions((prev) => prev.map((s) => (s.id === nextSession.id ? nextSession : s)))
        if (nextSession.apiConfigId != null) {
          setModelId((prev) => (prev === nextSession.apiConfigId ? prev : nextSession.apiConfigId))
        }
      } catch (e) {
        void e
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activeSessionId, apiFetch, messageOutToMessage, sessionOutToSession])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) {
      setIsAtBottom(true)
      isAtBottomRef.current = true
      return
    }

    const threshold = 32
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = distance <= threshold
      setIsAtBottom(atBottom)
      isAtBottomRef.current = atBottom
    }

    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [activeSessionId, hasMessages])

  // Auto scroll
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    if (!isAtBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [activeSession?.messages, activeSessionId])

  useLayoutEffect(() => {
    const el = composerTextareaRef.current
    if (!el) return

    el.style.height = 'auto'
    // 取消最大高度限制，让输入框随内容自动增高
    el.style.height = `${el.scrollHeight}px`
    el.style.overflowY = 'hidden'
  }, [draft])

  // Close model menu on outside click
  useEffect(() => {
    if (!modelMenuOpen) return
    const onPointerDown = (e) => {
      const host = modelMenuRef.current
      if (!host) return
      if (host.contains(e.target)) return
      setModelMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [modelMenuOpen])

  useEffect(() => {
    if (models.length === 0) setModelMenuOpen(false)
  }, [models.length])

  // Close menus on Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModelMenuOpen(false)
        setSettingsOpen(false)
        setModelEditorOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const startNewChat = useCallback(async () => {
    const created = await apiFetch('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat', api_config_id: modelId ?? null }),
    }).then((r) => r.json())
    const s = sessionOutToSession(created)
    setSessions((prev) => [s, ...prev])
    setActiveSessionId(s.id)
    setDraft('')
  }, [apiFetch, modelId, sessionOutToSession])

  const deleteSession = useCallback(
    async (sessionId) => {
      if (typeof sessionId === 'number') {
        try {
          await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' })
        } catch (e) {
          void e
        }
      }
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId)
        setActiveSessionId((currentActive) => {
          if (currentActive !== sessionId) return currentActive
          return next.length ? next[0].id : null
        })
        return next
      })
    },
    [apiFetch],
  )

  const updateSession = (sessionId, updater) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)))
  }

  const deleteModel = (id) => {
    if (typeof id !== 'number') return
    const run = async () => {
      await apiFetch(`/api-configs/${id}`, { method: 'DELETE' })
      await loadModels()
      setModelId((prev) => {
        if (prev == null) return null
        if (prev === id) return null
        return prev
      })
    }
    void run()
  }

  const openCreateModel = () => {
    setEditingModelId(null)
    setModelFormName('')
    setModelFormProvider('')
    setModelFormBaseUrl('')
    setModelFormApiKey('')
    setModelFormModel('')
    setModelFormChatCompletionsPath('/v1/chat/completions')
    setModelFormHeadersJson('{}')
    setModelFormTemperature('0.7')
    setModelEditorOpen(true)
  }

  const openEditModel = (model) => {
    setEditingModelId(model.id)
    setModelFormName(model.name || '')
    setModelFormProvider(model.provider || '')
    setModelFormBaseUrl(model.baseUrl || '')
    setModelFormApiKey(model.apiKey || '')
    setModelFormModel(model.model || '')
    setModelFormChatCompletionsPath(model.chatCompletionsPath || '/v1/chat/completions')
    setModelFormHeadersJson(model.headersJson || '{}')
    setModelFormTemperature(`${Number.isFinite(Number(model.temperature)) ? Number(model.temperature) : 0.7}`)
    setModelEditorOpen(true)
  }

  const handleSaveModel = () => {
    const name = `${modelFormName || ''}`.trim()
    if (!name) return

    const temperature = Number.parseFloat(`${modelFormTemperature || ''}`.trim())
    let extraHeaders = {}
    try {
      const raw = `${modelFormHeadersJson || ''}`.trim()
      const parsed = raw ? JSON.parse(raw) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Headers JSON 必须是对象，例如 {"X-Test":"1"}')
      }
      extraHeaders = parsed
    } catch (e) {
      void e
      return
    }

    const payload = {
      name,
      kind: 'openai_compatible',
      provider: `${modelFormProvider || ''}`,
      base_url: `${modelFormBaseUrl || ''}`.trim(),
      api_key: `${modelFormApiKey || ''}`.trim() || null,
      model: `${modelFormModel || ''}`.trim(),
      chat_completions_path: `${modelFormChatCompletionsPath || '/v1/chat/completions'}`.trim(),
      extra_headers: extraHeaders,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
    }

    const run = async () => {
      if (typeof editingModelId === 'number') {
        await apiFetch(`/api-configs/${editingModelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        const created = await apiFetch('/api-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then((r) => r.json())
        setModelId(created?.id ?? null)
      }
      await loadModels()
      setModelEditorOpen(false)
      setEditingModelId(null)
    }
    void run()
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || !activeSession) return

    setSending(true)
    setDraft('')
    streamingRef.current = true
    isAtBottomRef.current = true

    const userMessage = {
      id: createId('m'),
      role: 'user',
      content: text,
      ts: Date.now(),
    }

    // Optimistically update user message
    updateSession(activeSession.id, (s) => ({
      ...s,
      title: s.title === 'New Chat' ? titleFromText(text) : s.title,
      updatedAt: Date.now(),
      messages: [...s.messages, userMessage],
    }))

    const assistantMsgId = createId('m')
    updateSession(activeSession.id, (s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          ts: Date.now(),
        },
      ],
    }))

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller
      const selectedModel = models.find((m) => m.id === modelId)
      if (!selectedModel) {
        updateSession(activeSession.id, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: '未选择模型，无法发送请求。' } : m,
          ),
        }))
        return
      }

      const nextTitle = activeSession.title === 'New Chat' ? titleFromText(text) : activeSession.title
      if (typeof activeSession.id === 'number') {
        try {
          await apiFetch(`/sessions/${activeSession.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: nextTitle, api_config_id: selectedModel.id }),
          })
        } catch (e) {
          void e
        }
      }

      const resp = await apiFetch('/chat/stream', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          session_id: activeSession.id,
          api_config_id: selectedModel.id,
          user_content: text,
          temperature: Number.isFinite(Number(selectedModel.temperature)) ? Number(selectedModel.temperature) : 0.7,
        }),
      })

      if (!resp.body) throw new Error('Response body is empty')

      const reader = resp.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue
          if (!line.startsWith('data:')) continue
          const dataStr = line.replace(/^data:\s*/, '')
          if (dataStr === '[DONE]') {
            buffer = ''
            break
          }
          let event = null
          try {
            event = JSON.parse(dataStr)
          } catch {
            continue
          }
          const choice0 = event?.choices?.[0]
          const piece = choice0?.delta?.content
          if (!piece) continue
          updateSession(activeSession.id, (s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: `${m.content || ''}${piece}` } : m,
            ),
          }))
        }
      }

      if (typeof activeSession.id === 'number') {
        try {
          const detail = await apiFetch(`/sessions/${activeSession.id}`, { method: 'GET' }).then((r) => r.json())
          const nextSession = sessionOutToSession(detail.session)
          const nextMessages = Array.isArray(detail.messages) ? detail.messages.map(messageOutToMessage) : []
          nextSession.messages = nextMessages
          setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? nextSession : s)))
        } catch (e) {
          void e
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : `${err}`
      updateSession(activeSession.id, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, content: `请求失败：${msg}` } : m,
        ),
      }))
    } finally {
      setSending(false)
      streamingRef.current = false
      abortControllerRef.current = null
      readerRef.current = null
    }
  }

  const stopGeneration = useCallback(() => {
    try {
      readerRef.current?.cancel?.()
    } catch (e) {
      void e
    }
    abortControllerRef.current?.abort?.()
    setSending(false)
    streamingRef.current = false
  }, [])

  const copyToClipboard = useCallback(async (text) => {
    const value = `${text || ''}`
    if (!value) return
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
    const host = document.createElement('textarea')
    host.value = value
    host.style.position = 'fixed'
    host.style.left = '-9999px'
    host.style.top = '-9999px'
    document.body.appendChild(host)
    host.focus()
    host.select()
    document.execCommand('copy')
    document.body.removeChild(host)
  }, [])

  const onSubmit = (e) => {
    e.preventDefault()
    send()
  }

  const hasModels = models.length > 0
  const currentModelName =
    models.find((m) => m.id === modelId)?.name || (hasModels ? modelId : 'Select Model')

  return (
    <div className="electronRoot">
      <div className="electronTitlebar" />
      <div className={`app ${hasMessages ? 'has-messages' : 'is-empty'}`}>
      <aside className="sidebar">
        <div className="brandRow">
          <div className="brandText">
            <div className="brandName">VIPER</div>
          </div>

          <button 
            type="button" 
            className="iconBtn" 
            aria-label="Settings" 
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <div className="modelPicker" ref={modelMenuRef}>
          <button
            type="button"
            className={`modelButton ${modelMenuOpen ? 'is-open' : ''}`}
            onClick={() => {
              if (!hasModels) return
              setModelMenuOpen((v) => !v)
            }}
            aria-haspopup={hasModels ? 'listbox' : undefined}
            aria-expanded={hasModels ? modelMenuOpen : undefined}
            disabled={!hasModels}
          >
            {/* Removed label as requested */}
            <span className="modelValue" style={{ margin: '0 auto' }}>{currentModelName}</span>
            {hasModels ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="chev">
                <path
                  d="M7 10l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>

          {hasModels && modelMenuOpen ? (
            <div className="modelMenu" role="listbox" aria-label="Select Model">
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`modelItem ${m.id === modelId ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={m.id === modelId}
                  onClick={() => {
                    setModelId(m.id)
                    setModelMenuOpen(false)
                  }}
                >
                  <span className="modelItemName">{m.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="newChatBtn" type="button" onClick={startNewChat}>
          New Chat
        </button>

        <div className="sidebarSectionHeader">
          {/* Header removed */}
        </div>

        <div className="sessionList" role="list">
          {sessions.map((s) => {
            const active = s.id === activeSessionId
            return (
              <div
                key={s.id}
                className={`sessionItem ${active ? 'is-active' : ''}`}
                role="listitem"
                tabIndex={0}
                onClick={() => setActiveSessionId(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveSessionId(s.id)
                }}
              >
                <div className="sessionTitleRow">
                  <div className="sessionTitle" title={s.title}>
                    {s.title}
                  </div>
                  <div className="sessionTime">{formatTime(s.updatedAt)}</div>
                </div>
                <button
                  type="button"
                  className="sessionDeleteBtn"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(s.id)
                  }}
                  aria-label="Delete Session"
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 7l10 10M17 7 7 17"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      <main className="main">
        <section className="chat">
          {hasMessages ? (
            <div className="chatScroll" ref={chatScrollRef} aria-label="Chat Area">
              <div className="chatInnerWrap">
                <div className="chatInner">
                  {activeSession.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`msgRow ${m.role === 'user' ? 'is-user' : 'is-assistant'}`}
                    >
                      <div className="msgAvatar">
                        {m.role === 'user' ? (
                           <div className="avatarCircle userAvatar">
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                               <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
                               <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                             </svg>
                           </div>
                        ) : (
                           <div className="avatarCircle botAvatar">
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                               <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7V5.73C7.4 5.39 7 4.74 7 4a2 2 0 012-2h3z" strokeLinecap="round" strokeLinejoin="round"/>
                               <path d="M8 14h8" strokeLinecap="round" strokeLinejoin="round"/>
                               <path d="M12 17v1" strokeLinecap="round" strokeLinejoin="round"/>
                             </svg>
                           </div>
                        )}
                      </div>
                      <div className="msgContentCol">
                        <div className="msgBubble">
                          <div className="msgText">
                            <Markdown>{m.content}</Markdown>
                          </div>
                        </div>
                        {m.role === 'user' ? (
                          <div className="msgActions" role="toolbar" aria-label="Message actions">
                            <button
                              type="button"
                              className="msgActionBtn"
                              aria-label="Copy"
                              title="Copy"
                              onClick={() => copyToClipboard(m.content)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <rect
                                  x="9"
                                  y="9"
                                  width="10"
                                  height="10"
                                  rx="2"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M7 15H6a2 2 0 01-2-2V6a2 2 0 012-2h7a2 2 0 012 2v1"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
             <div className="hero">
               <div className="heroTitle">VIPER</div>
             </div>
          )}

          <form className="composer" onSubmit={onSubmit}>
            <div className="composerInnerWrap">
              <div className="composerBox">
                {hasMessages && !isAtBottom ? (
                  <button
                    type="button"
                    className="scrollToBottomBtn"
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                    onClick={() => scrollToBottom('smooth')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 10l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <textarea
                  ref={composerTextareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything..."
                  rows={hasMessages ? 1 : 3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  aria-label="Input Message"
                />

                <div className="composerLeft">
                  <button type="button" className="actionBtn" aria-label="Add" title="Add">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                <div className="composerRight">
                  {sending ? (
                    <button
                      className="sendBtn stopBtn"
                      type="button"
                      onClick={stopGeneration}
                      aria-label="Stop"
                      title="Stop"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                        <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="sendBtn"
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send"
                      title="Send"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </section>
      </main>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="modalOverlay" onClick={() => setSettingsOpen(false)}>
          <div className="modalContent" onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2 className="modalTitle">Settings</h2>
              <button className="modalCloseBtn" onClick={() => setSettingsOpen(false)} aria-label="Close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            <div className="modalBody">
              <button className="modalBtn primary centered-btn" onClick={openCreateModel} style={{marginBottom: '16px'}}>
                Add New Model
              </button>
              
              <div className="label" style={{textAlign: 'center'}}>Manage Models (Right-click to edit/delete)</div>
              <div className="settingsModelList">
                {models.map(m => (
                  <div 
                    key={m.id} 
                    className="settingsModelItem"
                    onContextMenu={(e) => handleContextMenu(e, m)}
                  >
                    <span className="settingsModelName">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="modalFooter">
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="contextMenu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
           <div className="contextMenuItem" onClick={() => {
             openEditModel(contextMenu.model)
             setContextMenu(null)
           }}>
             Edit
           </div>
           <div className="contextMenuItem danger" onClick={() => {
             deleteModel(contextMenu.model.id)
             setContextMenu(null)
           }}>
             Delete
           </div>
        </div>
      )}

      {modelEditorOpen && (
        <div className="modalOverlay" onClick={() => setModelEditorOpen(false)}>
          <div className="modalContent" onClick={e => e.stopPropagation()}>
            <h2 className="modalTitle">{editingModelId ? 'Edit Model' : 'Add New Model'}</h2>
            
            <div className="modalBody">
              <div>
                <label className="label">Model Name</label>
                <input
                  className="inputField" 
                  value={modelFormName}
                  onChange={e => setModelFormName(e.target.value)}
                  placeholder="Model Name"
                />
              </div>
              <div>
                <label className="label">Provider</label>
                <input
                  className="inputField"
                  value={modelFormProvider}
                  onChange={(e) => setModelFormProvider(e.target.value)}
                  placeholder="provider"
                />
              </div>
              <div>
                <label className="label">Base URL</label>
                <input
                  className="inputField" 
                  value={modelFormBaseUrl}
                  onChange={e => setModelFormBaseUrl(e.target.value)}
                  placeholder="https://api.host"
                />
              </div>
              <div>
                <label className="label">API Key</label>
                <input
                  className="inputField"
                  type="password"
                  value={modelFormApiKey}
                  onChange={e => setModelFormApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="label">Model</label>
                <input
                  className="inputField"
                  value={modelFormModel}
                  onChange={e => setModelFormModel(e.target.value)}
                  placeholder="model"
                />
              </div>
              <div>
                <label className="label">Chat Completions Path</label>
                <input
                  className="inputField"
                  value={modelFormChatCompletionsPath}
                  onChange={e => setModelFormChatCompletionsPath(e.target.value)}
                  placeholder="/v1/chat/completions"
                />
              </div>
              <div>
                <label className="label">Headers JSON</label>
                <textarea
                  className="inputField"
                  value={modelFormHeadersJson}
                  onChange={(e) => setModelFormHeadersJson(e.target.value)}
                  placeholder="{}"
                  rows={4}
                />
              </div>
              <div>
                <label className="label">Temperature</label>
                <input
                  className="inputField"
                  type="number"
                  value={modelFormTemperature}
                  onChange={(e) => setModelFormTemperature(e.target.value)}
                  placeholder="0.7"
                  step="0.1"
                  min="0"
                  max="2"
                />
              </div>
            </div>

            <div className="modalFooter">
              <button className="modalBtn" onClick={() => setModelEditorOpen(false)}>Cancel</button>
              <button className="modalBtn primary" onClick={handleSaveModel}>Save</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
