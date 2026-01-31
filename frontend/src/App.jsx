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
  }
}

function isLegacySeedModel(model) {
  return (
    model?.name === 'DeepSeek' &&
    model?.provider === 'deepseek' &&
    model?.baseUrl === 'https://api.deepseek.com' &&
    model?.model === 'deepseek-chat' &&
    model?.chatCompletionsPath === '/v1/chat/completions'
  )
}

export default function App() {
  const [models, setModels] = useState([])
  const [modelId, setModelId] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [editingModelId, setEditingModelId] = useState(null)

  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Settings form state
  const [modelFormName, setModelFormName] = useState('')
  const [modelFormProvider, setModelFormProvider] = useState('')
  const [modelFormBaseUrl, setModelFormBaseUrl] = useState('')
  const [modelFormApiKey, setModelFormApiKey] = useState('')
  const [modelFormModel, setModelFormModel] = useState('')
  const [modelFormChatCompletionsPath, setModelFormChatCompletionsPath] = useState('/v1/chat/completions')

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

  // TODO: Fetch models from backend
  useEffect(() => {
    // api.getModels().then(data => {
    //   setModels(data)
    //   if (data.length > 0) setModelId(data[0].id)
    // })
    
    // Temporary: Set empty or default if needed for UI testing without backend
    // setModels([]) 
  }, [])

  useEffect(() => {
    const rawModels = localStorage.getItem('viper.models.v1')
    const rawModelId = localStorage.getItem('viper.modelId.v1')
    let parsedModels = null
    try {
      parsedModels = rawModels ? JSON.parse(rawModels) : null
    } catch {
      parsedModels = null
    }
    const safeModels = Array.isArray(parsedModels) ? parsedModels.map(makeModel) : null
    if (safeModels?.length) {
      if (safeModels.length === 1 && isLegacySeedModel(safeModels[0])) {
        localStorage.removeItem('viper.models.v1')
        localStorage.removeItem('viper.modelId.v1')
        setModels([])
        setModelId('')
        return
      }
      setModels(safeModels)
      const preferredId =
        rawModelId && safeModels.some((m) => m.id === rawModelId) ? rawModelId : safeModels[0].id
      setModelId(preferredId)
      return
    }
    setModels([])
    setModelId('')
  }, [])

  useEffect(() => {
    localStorage.setItem('viper.models.v1', JSON.stringify(models))
  }, [models])

  useEffect(() => {
    if (modelId) localStorage.setItem('viper.modelId.v1', modelId)
    else localStorage.removeItem('viper.modelId.v1')
  }, [modelId])

  useEffect(() => {
    if (models.length === 0) {
      if (modelId) setModelId('')
      return
    }
    if (modelId && models.some((m) => m.id === modelId)) return
    setModelId(models[0].id)
  }, [modelId, models])

  const startNewChat = useCallback(() => {
    const s = makeSession('New Chat')
    setSessions((prev) => [s, ...prev])
    setActiveSessionId(s.id)
    setDraft('')
  }, [])

  // TODO: Fetch sessions from backend
  useEffect(() => {
    // api.getSessions().then(data => {
    //   setSessions(data)
    //   if (data.length > 0) setActiveSessionId(data[0].id)
    //   else startNewChat()
    // })
    
    // Temporary initialization for UI to work
    if (sessions.length === 0) {
      startNewChat()
    }
  }, [sessions.length, startNewChat])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions],
  )

  // Auto scroll
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    // Only scroll if near bottom or if it's a new message
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

  const deleteSession = (sessionId) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId)
      const safeNext = next.length ? next : [makeSession('New Chat')]
      setActiveSessionId((currentActive) => {
        if (currentActive !== sessionId) return currentActive
        return safeNext[0].id
      })
      return safeNext
    })
  }

  const updateSession = (sessionId, updater) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)))
  }

  const deleteModel = (id) => {
    setModels((prev) => prev.filter((m) => m.id !== id))
  }

  const openCreateModel = () => {
    setEditingModelId(null)
    setModelFormName('')
    setModelFormProvider('')
    setModelFormBaseUrl('')
    setModelFormApiKey('')
    setModelFormModel('')
    setModelFormChatCompletionsPath('/v1/chat/completions')
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
    setModelEditorOpen(true)
  }

  const handleSaveModel = () => {
    const name = `${modelFormName || ''}`.trim()
    if (!name) return

    const nextModel = makeModel({
      id: editingModelId,
      name,
      provider: modelFormProvider,
      baseUrl: modelFormBaseUrl,
      apiKey: modelFormApiKey,
      model: modelFormModel,
      chatCompletionsPath: modelFormChatCompletionsPath,
    })

    setModels((prev) => {
      if (editingModelId) return prev.map((m) => (m.id === editingModelId ? nextModel : m))
      return [...prev, nextModel]
    })
    if (!editingModelId) setModelId(nextModel.id)

    setModelEditorOpen(false)
    setEditingModelId(null)
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || !activeSession) return

    setSending(true)
    setDraft('')
    streamingRef.current = true

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
    
    const selectedModel = models.find((m) => m.id === modelId)
    if (!selectedModel) {
      updateSession(activeSession.id, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, content: '未选择模型，无法发送请求。' } : m,
        ),
      }))
      setSending(false)
      streamingRef.current = false
      return
    }

    const baseUrl = normalizeBaseUrl(selectedModel.baseUrl)
    if (!baseUrl) {
      updateSession(activeSession.id, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, content: 'Base URL 为空，请先在 Settings 里配置模型。' } : m,
        ),
      }))
      setSending(false)
      streamingRef.current = false
      return
    }
    const chatPath = `${selectedModel.chatCompletionsPath || '/v1/chat/completions'}`.startsWith('/')
      ? selectedModel.chatCompletionsPath
      : `/${selectedModel.chatCompletionsPath}`
    const url = `${baseUrl}${chatPath}`

    const outgoingMessages = [...activeSession.messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(selectedModel.apiKey
            ? { Authorization: `Bearer ${selectedModel.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: selectedModel.model,
          messages: outgoingMessages,
          stream: true,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`${resp.status} ${resp.statusText}${text ? `\n${text}` : ''}`)
      }

      if (!resp.body) throw new Error('Response body is empty')

      const reader = resp.body.getReader()
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
    } catch (err) {
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
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    send()
  }

  const hasModels = models.length > 0
  const currentModelName =
    models.find((m) => m.id === modelId)?.name || (hasModels ? modelId : 'Select Model')
  const hasMessages = activeSession?.messages?.length > 0

  return (
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
                  <button
                    className="sendBtn"
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label="Send"
                    title="Send"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
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
            </div>

            <div className="modalFooter">
              <button className="modalBtn" onClick={() => setModelEditorOpen(false)}>Cancel</button>
              <button className="modalBtn primary" onClick={handleSaveModel}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
