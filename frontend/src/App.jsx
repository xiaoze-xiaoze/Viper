import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import './App.css'

// Initial data generation helpers
function createId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function generateDummyModels() {
  const base = [
    { id: 'kimi', name: 'Kimi' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'mistral-large', name: 'Mistral Large' },
    { id: 'llama-3-70b', name: 'Llama 3 70B' },
  ]
  // Add more to test scrolling
  for (let i = 1; i <= 15; i++) {
    base.push({ id: `custom-model-${i}`, name: `Custom Model ${i}` })
  }
  return base
}

const INITIAL_MODELS = generateDummyModels()

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
    updatedAt: Date.now() - Math.floor(Math.random() * 10000000), // Random time for variety
    messages: [],
  }
}

function generateDummySessions() {
  const sessions = []
  for (let i = 1; i <= 25; i++) {
    sessions.push(makeSession(`History Session ${i}`))
  }
  // Add one empty new chat at the top
  const current = makeSession('New Chat')
  current.updatedAt = Date.now()
  return [current, ...sessions.sort((a, b) => b.updatedAt - a.updatedAt)]
}

const INITIAL_SESSIONS = generateDummySessions()

export default function App() {
  const [models, setModels] = useState(INITIAL_MODELS)
  const [modelId, setModelId] = useState('kimi')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addModelOpen, setAddModelOpen] = useState(false)

  const [sessions, setSessions] = useState(INITIAL_SESSIONS)
  const [activeSessionId, setActiveSessionId] = useState(INITIAL_SESSIONS[0].id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Settings form state
  const [newModelName, setNewModelName] = useState('')
  const [newModelApi, setNewModelApi] = useState('')

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
  const streamIntervalRef = useRef(null)

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

  // Close menus on Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModelMenuOpen(false)
        setSettingsOpen(false)
        setAddModelOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const startNewChat = () => {
    const s = makeSession('New Chat')
    setSessions((prev) => [s, ...prev])
    setActiveSessionId(s.id)
    setDraft('')
  }

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
    if (models.length <= 1) return // Prevent deleting last model
    setModels(prev => prev.filter(m => m.id !== id))
    if (modelId === id) {
      setModelId(models[0].id)
    }
  }

  const handleAddModel = () => {
    if (!newModelName.trim()) return
    const newModel = {
      id: `custom-${Date.now()}`,
      name: newModelName,
      api: newModelApi // In a real app we'd store this securely
    }
    setModels(prev => [...prev, newModel])
    setNewModelName('')
    setNewModelApi('')
    setAddModelOpen(false)
  }

  const send = () => {
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

    // Placeholder response text
    const fullReply = `Received: "${text}"\n\n**Streaming Simulation**\n\nCurrently using model: **${
      models.find((m) => m.id === modelId)?.name || modelId
    }**.\n\nHere is a list of features implemented:\n- Markdown Rendering\n- Streaming effect\n- Settings Modal\n- English UI`
    
    // Initial assistant message placeholder
    const assistantMsgId = createId('m')
    updateSession(activeSession.id, (s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '', // Start empty
          ts: Date.now(),
        },
      ],
    }))

    // Simulate streaming
    let charIndex = 0
    streamIntervalRef.current = setInterval(() => {
      if (charIndex >= fullReply.length) {
        clearInterval(streamIntervalRef.current)
        setSending(false)
        streamingRef.current = false
        return
      }

      const nextChunk = fullReply.slice(0, charIndex + 5) // Append 5 chars at a time
      charIndex += 5

      // Update the last message content
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSession.id) return s
        const msgs = [...s.messages]
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg.id === assistantMsgId) {
          lastMsg.content = nextChunk
        }
        return { ...s, messages: msgs }
      }))

    }, 30) // Speed of typing
  }

  const onSubmit = (e) => {
    e.preventDefault()
    send()
  }

  const currentModelName = models.find((m) => m.id === modelId)?.name || modelId
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
            onClick={() => setModelMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={modelMenuOpen}
          >
            {/* Removed label as requested */}
            <span className="modelValue" style={{ margin: '0 auto' }}>{currentModelName}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="chev">
              <path
                d="M7 10l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {modelMenuOpen ? (
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
              <button className="modalBtn primary fullWidth centered-btn" onClick={() => setAddModelOpen(true)} style={{marginBottom: '16px'}}>
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
             console.log('Edit', contextMenu.model.id)
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

      {/* Add Model Modal (Nested) */}
      {addModelOpen && (
        <div className="modalOverlay" onClick={() => setAddModelOpen(false)}>
          <div className="modalContent" onClick={e => e.stopPropagation()}>
            <h2 className="modalTitle">Add New Model</h2>
            
            <div className="modalBody">
              <div>
                <label className="label">Model Name</label>
                <input 
                  className="inputField" 
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                  placeholder="e.g. Llama 3 Local"
                />
              </div>
              <div>
                <label className="label">API Endpoint / Key</label>
                <input 
                  className="inputField" 
                  value={newModelApi}
                  onChange={e => setNewModelApi(e.target.value)}
                  placeholder="Enter API configuration..."
                />
              </div>
            </div>

            <div className="modalFooter">
              <button className="modalBtn" onClick={() => setAddModelOpen(false)}>Cancel</button>
              <button className="modalBtn primary" onClick={handleAddModel}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
