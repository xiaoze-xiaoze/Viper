import { useState, useRef, useEffect, useMemo } from 'react';
import { SettingOutlined, DownOutlined, ArrowUpOutlined, PlusOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import './App.css';

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function clampNumber(n, { min, max, fallback }) {
  const value = Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeOptionalNumber(raw, { min, max }) {
  if (raw == null) return undefined;
  if (typeof raw === 'string' && raw.trim().length === 0) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function joinUrl(baseUrl, path) {
  const base = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const p = typeof path === 'string' ? path.trim() : '';
  if (!base) return p;
  if (!p) return base;
  return `${base.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`;
}

function parseHeadersJson(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return {};
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const headers = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof key !== 'string' || key.trim().length === 0) continue;
    if (value == null) continue;
    headers[key] = typeof value === 'string' ? value : String(value);
  }
  return headers;
}

function getInitialModels() {
  return [];
}

function getInitialSelectedModel(initialModels) {
  return initialModels[0]?.name ?? '';
}

function getInitialChatState() {
  return { sessions: [], messagesByChatId: {}, currentChatId: null };
}

function buildChatTitleFromText(text) {
  const cleaned = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (!cleaned) return 'New Chat';
  const firstLine = cleaned.split('\n')[0].trim();
  const sliced = firstLine.length > 36 ? `${firstLine.slice(0, 36)}…` : firstLine;
  return sliced || 'New Chat';
}

async function fetchWithTimeout(url, init, { timeoutMs }) {
  const timeout = clampNumber(timeoutMs, { min: 1000, max: 180000, fallback: 60000 });
  const controller = new AbortController();
  const outerSignal = init?.signal;
  const onAbort = () => controller.abort(outerSignal?.reason);
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort(outerSignal.reason);
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }
}

function getEnvString(key) {
  try {
    const value = import.meta?.env?.[key];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function getApiBaseUrl() {
  return getEnvString('VITE_API_BASE_URL').trim();
}

function normalizeChatSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number.isFinite(Number(raw.id)) ? Number(raw.id) : null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const timestamp = raw.timestamp ? new Date(raw.timestamp) : null;
  if (!id || !title || !timestamp || Number.isNaN(timestamp.getTime())) return null;
  return { id, title, timestamp };
}

function normalizeModelConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id == null ? undefined : Number.isFinite(Number(raw.id)) ? Number(raw.id) : undefined;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const apiBaseUrl = typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl.trim() : '';
  const source = typeof raw.source === 'string' ? raw.source : 'custom';
  const type = typeof raw.type === 'string' ? raw.type.trim() : 'chat.completions';
  const modelId = typeof raw.modelId === 'string' ? raw.modelId.trim() : '';
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : '';
  const headers = typeof raw.headers === 'string' ? raw.headers : '';
  const temperature = raw.temperature == null ? undefined : normalizeOptionalNumber(raw.temperature, { min: 0, max: 2 });
  const maxTokens = raw.maxTokens == null ? undefined : normalizeOptionalNumber(raw.maxTokens, { min: 1, max: 200000 });
  if (!name) return null;
  return { id, name, apiBaseUrl, source, type, modelId, apiKey, headers, temperature, maxTokens };
}

async function apiRequest(baseUrl, path, init, { timeoutMs } = {}) {
  const url = joinUrl(baseUrl, path);
  return fetchWithTimeout(url, init, { timeoutMs: timeoutMs ?? 60000 });
}

async function apiJson(baseUrl, path, init, { timeoutMs } = {}) {
  const response = await apiRequest(baseUrl, path, init, { timeoutMs });
  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      void 0;
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }
  if (response.status === 204) return null;
  let text = '';
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text) return null;
  return safeJsonParse(text) ?? text;
}

function unwrapItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.items)) return payload.items;
  return null;
}

async function loadRemoteBootstrap(baseUrl) {
  const bootstrap = await apiJson(baseUrl, '/api/bootstrap', { method: 'GET' }, { timeoutMs: 30000 });
  const modelsRaw = unwrapItems(bootstrap?.models) ?? unwrapItems(bootstrap?.modelConfigs) ?? unwrapItems(bootstrap) ?? [];
  const sessionsRaw = unwrapItems(bootstrap?.chats) ?? unwrapItems(bootstrap?.chatSessions) ?? [];
  const models = modelsRaw.map(normalizeModelConfig).filter(Boolean);
  const sessions = sessionsRaw.map(normalizeChatSession).filter(Boolean);
  const selectedModel = typeof bootstrap?.selectedModel === 'string' ? bootstrap.selectedModel : typeof bootstrap?.selectedModelName === 'string' ? bootstrap.selectedModelName : '';
  const currentChatId = Number.isFinite(Number(bootstrap?.currentChatId)) ? Number(bootstrap.currentChatId) : (sessions[0]?.id ?? null);
  const messagesByChatIdRaw = bootstrap?.messagesByChatId && typeof bootstrap.messagesByChatId === 'object' ? bootstrap.messagesByChatId : null;
  const messagesByChatId = {};
  if (messagesByChatIdRaw) {
    for (const session of sessions) {
      const rawMessages = messagesByChatIdRaw[String(session.id)];
      if (!Array.isArray(rawMessages)) {
        messagesByChatId[session.id] = [];
        continue;
      }
      messagesByChatId[session.id] = rawMessages
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({
          id: typeof m.id === 'string' && m.id.trim().length > 0 ? m.id : createId(),
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : '',
          createdAt: typeof m.createdAt === 'string' && m.createdAt ? m.createdAt : new Date().toISOString(),
          status: typeof m.status === 'string' ? m.status : 'sent',
          error: typeof m.error === 'string' ? m.error : '',
        }));
    }
  } else {
    for (const session of sessions) messagesByChatId[session.id] = [];
  }
  return { models, sessions, selectedModel, currentChatId, messagesByChatId };
}

function extractReadableError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err?.name === 'AbortError') return 'Aborted';
  if (typeof err?.message === 'string' && err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function isIgnorableAbort(err) {
  if (!err) return false;
  if (err?.name === 'AbortError') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (message.includes('ERR_ABORTED')) return true;
  return false;
}

function getOpenAiDeltaContent(payload) {
  const choice = payload?.choices?.[0];
  const delta = choice?.delta;
  if (typeof delta?.content === 'string') return delta.content;
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  return '';
}

function estimateTokenCount(text) {
  const t = typeof text === 'string' ? text : '';
  if (!t) return 0;
  const cjkMatches = t.match(/[\u3400-\u9FFF]/g);
  const cjk = cjkMatches ? cjkMatches.length : 0;
  const nonCjk = t.replace(/[\u3400-\u9FFF]/g, '').length;
  return cjk + Math.ceil(nonCjk / 4);
}

function estimateContextTokens(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  let total = 0;
  for (const m of messages) {
    total += 4;
    total += estimateTokenCount(m?.content ?? '');
  }
  return total;
}

async function streamOpenAiSse(response, { onDelta, signal }) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const json = await response.json();
    const full = getOpenAiDeltaContent(json);
    if (full) onDelta(full);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const splitIndex = buffer.indexOf('\n\n');
      if (splitIndex === -1) break;
      const rawEvent = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);
      const lines = rawEvent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice('data:'.length).trim();
        if (!data) continue;
        if (data === '[DONE]') return;
        const json = safeJsonParse(data);
        if (!json) continue;
        const delta = getOpenAiDeltaContent(json);
        if (delta) onDelta(delta);
      }
    }
  }
}

function App() {
  const [inputValue, setInputValue] = useState('');
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [dataError, setDataError] = useState('');
  const initialChatState = useMemo(() => getInitialChatState(), []);
  const [chatSessions, setChatSessions] = useState(() => initialChatState.sessions);
  const [messagesByChatId, setMessagesByChatId] = useState(() => initialChatState.messagesByChatId);
  const [currentChatId, setCurrentChatId] = useState(() => initialChatState.currentChatId);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [models, setModels] = useState(() => getInitialModels());
  const [selectedModel, setSelectedModel] = useState(() => getInitialSelectedModel(getInitialModels()));
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelApiBaseUrl, setNewModelApiBaseUrl] = useState('');
  const [newModelType, setNewModelType] = useState('chat.completions');
  const [newModelId, setNewModelId] = useState('');
  const [newModelApiKey, setNewModelApiKey] = useState('');
  const [newModelHeaders, setNewModelHeaders] = useState('');
  const [newModelTemperature, setNewModelTemperature] = useState('');
  const [newModelMaxTokens, setNewModelMaxTokens] = useState('');
  const [addModelError, setAddModelError] = useState('');
  const [isEditModelOpen, setIsEditModelOpen] = useState(false);
  const [editModelOriginalName, setEditModelOriginalName] = useState('');
  const [editModelName, setEditModelName] = useState('');
  const [editModelApiBaseUrl, setEditModelApiBaseUrl] = useState('');
  const [editModelType, setEditModelType] = useState('chat.completions');
  const [editModelId, setEditModelId] = useState('');
  const [editModelApiKey, setEditModelApiKey] = useState('');
  const [editModelHeaders, setEditModelHeaders] = useState('');
  const [editModelTemperature, setEditModelTemperature] = useState('');
  const [editModelMaxTokens, setEditModelMaxTokens] = useState('');
  const [editModelError, setEditModelError] = useState('');
  const [confirmPopover, setConfirmPopover] = useState(null);
  const [isRenamingChat, setIsRenamingChat] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [requestState, setRequestState] = useState({ status: 'idle', error: '' });

  const textareaRef = useRef(null);
  const modelSelectorRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const loadedChatIdsRef = useRef(new Set());
  const remoteReadyRef = useRef(false);
  const selectedModelSyncedRef = useRef('');
  const activeRequestRef = useRef({ controller: null, chatId: null, assistantMessageId: null });

  const currentChatTitle = chatSessions.find((c) => c.id === currentChatId)?.title ?? 'New Chat';
  const messages = useMemo(() => messagesByChatId[currentChatId] ?? [], [messagesByChatId, currentChatId]);
  const lastMessageContent = useMemo(() => messages[messages.length - 1]?.content ?? '', [messages]);
  const isGenerating = requestState.status === 'sending' || requestState.status === 'streaming';
  const selectedModelConfig = useMemo(() => models.find((m) => m.name === selectedModel) ?? null, [models, selectedModel]);
  const contextTokens = useMemo(() => estimateContextTokens(messages), [messages]);
  const contextBudget = useMemo(
    () => clampNumber(selectedModelConfig?.maxTokens, { min: 1, max: 200000, fallback: 1024 }),
    [selectedModelConfig?.maxTokens],
  );
  const contextPercent = useMemo(() => {
    if (!contextBudget) return 0;
    return Math.min(100, Math.max(0, (contextTokens / contextBudget) * 100));
  }, [contextTokens, contextBudget]);

  // Auto-adjust textarea height (only expand beyond 4 rows when needed)
  useEffect(() => {
    if (textareaRef.current) {
      const lineHeight = 24; // Approximate line height in pixels
      const minHeight = lineHeight * 4; // 4 rows minimum

      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;

      if (scrollHeight > minHeight) {
        textareaRef.current.style.height = scrollHeight + 'px';
      } else {
        textareaRef.current.style.height = minHeight + 'px';
      }
    }
  }, [inputValue]);

  useEffect(() => {
    if (!showModelDropdown) return;
    const onMouseDown = (e) => {
      const el = modelSelectorRef.current;
      if (el && el.contains(e.target)) return;
      setShowModelDropdown(false);
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [showModelDropdown]);

  useEffect(() => {
    if (models.length > 0) return;
    if (!showModelDropdown) return;
    setShowModelDropdown(false);
  }, [models.length, showModelDropdown]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const next = await loadRemoteBootstrap(apiBaseUrl);
        if (cancelled) return;
        setModels(next.models);
        const nextSelected = next.selectedModel && next.models.some((m) => m.name === next.selectedModel)
          ? next.selectedModel
          : next.models[0]?.name ?? '';
        setSelectedModel(nextSelected);
        selectedModelSyncedRef.current = nextSelected;
        setChatSessions(next.sessions);
        setMessagesByChatId(next.messagesByChatId);
        setCurrentChatId(next.currentChatId);
        loadedChatIdsRef.current = new Set(Object.keys(next.messagesByChatId ?? {}).map((k) => Number(k)).filter((n) => Number.isFinite(n)));
        remoteReadyRef.current = true;
        setDataError('');
      } catch (err) {
        if (cancelled) return;
        if (isIgnorableAbort(err)) return;
        setDataError(extractReadableError(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const chatId = currentChatId;
    if (!chatId) return;
    if (loadedChatIdsRef.current.has(chatId)) return;
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await apiJson(apiBaseUrl, `/api/chats/${chatId}/messages`, { method: 'GET' }, { timeoutMs: 30000 });
        const items = unwrapItems(payload) ?? [];
        const messages = items
          .filter((m) => m && typeof m === 'object')
          .map((m) => ({
            id: typeof m.id === 'string' && m.id.trim().length > 0 ? m.id : createId(),
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m.content === 'string' ? m.content : '',
            createdAt: typeof m.createdAt === 'string' && m.createdAt ? m.createdAt : new Date().toISOString(),
            status: typeof m.status === 'string' ? m.status : 'sent',
            error: typeof m.error === 'string' ? m.error : '',
          }));
        if (cancelled) return;
        loadedChatIdsRef.current.add(chatId);
        setMessagesByChatId((prev) => ({ ...prev, [chatId]: messages }));
      } catch (err) {
        if (cancelled) return;
        if (isIgnorableAbort(err)) return;
        setDataError(extractReadableError(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, currentChatId]);

  useEffect(() => {
    if (!remoteReadyRef.current) return;
    const model = models.find((m) => m.name === selectedModel) ?? null;
    if (!model) return;
    if (selectedModelSyncedRef.current === model.name) return;
    let cancelled = false;
    const run = async () => {
      try {
        await apiJson(
          apiBaseUrl,
          '/api/models/selected',
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model.name, id: model.id }) },
          { timeoutMs: 30000 },
        );
        selectedModelSyncedRef.current = model.name;
      } catch (err) {
        if (cancelled) return;
        if (isIgnorableAbort(err)) return;
        setDataError(extractReadableError(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, models, selectedModel]);

  useEffect(() => {
    if (!confirmPopover) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setConfirmPopover(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmPopover]);

  useEffect(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const threshold = 240;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < threshold) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, lastMessageContent]);

  const updateMessagesForChat = (chatId, updater) => {
    setMessagesByChatId((prev) => {
      const existing = prev[chatId] ?? [];
      const next = updater(existing);
      if (next === existing) return prev;
      return { ...prev, [chatId]: next };
    });
  };

  const updateChatSession = (chatId, updater) => {
    setChatSessions((prev) => prev.map((s) => (s.id === chatId ? updater(s) : s)));
  };

  const stopGenerating = () => {
    const active = activeRequestRef.current;
    if (!active.controller) return;
    try {
      active.controller.abort();
    } catch {
      void 0;
    }
  };

  const runChatCompletion = async ({ chatId, assistantMessageId, mode, requestMessages }) => {
    const model = selectedModelConfig;
    if (!model) throw new Error('No model selected');
    const upstreamBaseUrl = model.apiBaseUrl?.trim?.() ?? '';
    if (!upstreamBaseUrl) throw new Error('Model API endpoint is empty. Set it in Settings → Models.');

    const headersFromJson = parseHeadersJson(model.headers);
    if (headersFromJson === null) throw new Error('Model headers must be valid JSON');

    const controller = new AbortController();
    activeRequestRef.current = { controller, chatId, assistantMessageId };
    setRequestState({ status: 'sending', error: '' });

    const existingAssistant = (messagesByChatId[chatId] ?? []).find((m) => m.id === assistantMessageId) ?? null;
    let assistantContent = typeof existingAssistant?.content === 'string' ? existingAssistant.content : '';

    const baseVisible = (messagesByChatId[chatId] ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content }));
    const visibleFromState = mode === 'continue'
      ? baseVisible
      : baseVisible.filter((m) => m.id !== assistantMessageId);

    const visible = Array.isArray(requestMessages) ? requestMessages : visibleFromState.map((m) => ({ role: m.role, content: m.content }));
    const finalMessages = mode === 'continue'
      ? [{ role: 'system', content: 'Continue from where you left off. Do not repeat.' }, ...visible]
      : visible;

    const payload = {
      model: {
        id: model.id ?? null,
        name: model.name,
        apiBaseUrl: upstreamBaseUrl,
        type: model.type ?? 'chat.completions',
        modelId: model.modelId ?? '',
        apiKey: model.apiKey ?? '',
        headers: headersFromJson,
      },
      messages: finalMessages,
      stream: true,
      temperature: clampNumber(model.temperature, { min: 0, max: 2, fallback: 1 }),
      max_tokens: clampNumber(model.maxTokens, { min: 1, max: 200000, fallback: 1024 }),
      viper: { chat_id: chatId, assistant_message_id: assistantMessageId, mode },
    };

    const url = joinUrl(apiBaseUrl, '/api/llm/chat/completions');
    const requestHeaders = { 'Content-Type': 'application/json' };

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
      { timeoutMs: 60000 },
    );

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        void 0;
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
    }

    setRequestState({ status: 'streaming', error: '' });
    await streamOpenAiSse(response, {
      signal: controller.signal,
      onDelta: (delta) => {
        assistantContent = `${assistantContent}${delta}`;
        updateMessagesForChat(chatId, (prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, content: `${m.content}${delta}`, status: 'streaming', error: '' } : m)),
        );
      },
    });

    updateMessagesForChat(chatId, (prev) =>
      prev.map((m) => (m.id === assistantMessageId ? { ...m, status: 'sent', error: '' } : m)),
    );
    updateChatSession(chatId, (s) => ({ ...s, timestamp: new Date() }));
    try {
      await apiJson(
        apiBaseUrl,
        `/api/chats/${chatId}/messages/${encodeURIComponent(assistantMessageId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: assistantContent, status: 'sent', error: '' }),
        },
        { timeoutMs: 30000 },
      );
    } catch (error) {
      void error;
    }
    setRequestState({ status: 'idle', error: '' });
    activeRequestRef.current = { controller: null, chatId: null, assistantMessageId: null };
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (isGenerating) return;
    const text = inputValue.trim();
    if (!text) return;

    const ensureRemoteChatExists = async () => {
      const exists = chatSessions.some((c) => c.id === currentChatId);
      if (exists) return currentChatId;
      const created = await apiJson(
        apiBaseUrl,
        '/api/chats',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Chat' }) },
        { timeoutMs: 30000 },
      );
      const session = normalizeChatSession(created) ?? normalizeChatSession(created?.item) ?? null;
      if (!session) throw new Error('Failed to create chat');
      setChatSessions((prev) => [session, ...prev]);
      setMessagesByChatId((prev) => ({ ...prev, [session.id]: [] }));
      loadedChatIdsRef.current.add(session.id);
      setCurrentChatId(session.id);
      return session.id;
    };

    const chatId = await ensureRemoteChatExists();
    const existingMessages = messagesByChatId[chatId] ?? [];
    const userMessage = { id: createId(), role: 'user', content: text, createdAt: new Date().toISOString(), status: 'sent', error: '' };
    const assistantId = createId();
    const assistantMessage = { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString(), status: 'streaming', error: '' };

    updateMessagesForChat(chatId, (prev) => [...prev, userMessage, assistantMessage]);
    setInputValue('');

    if (existingMessages.filter((m) => m.role === 'user').length === 0) {
      const nextTitle = buildChatTitleFromText(text);
      updateChatSession(chatId, (s) => ({ ...s, title: nextTitle, timestamp: new Date() }));
      try {
        await apiJson(
          apiBaseUrl,
          `/api/chats/${chatId}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: nextTitle }) },
          { timeoutMs: 30000 },
        );
      } catch (error) {
        void error;
      }
    } else {
      updateChatSession(chatId, (s) => ({ ...s, timestamp: new Date() }));
    }

    const persistMessage = async (message) => {
      await apiJson(
        apiBaseUrl,
        `/api/chats/${chatId}/messages`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) },
        { timeoutMs: 30000 },
      );
    };
    try {
      await persistMessage(userMessage);
      await persistMessage(assistantMessage);
      loadedChatIdsRef.current.add(chatId);
    } catch (error) {
      void error;
    }

    const requestMessages = [...existingMessages, userMessage].map((m) => ({ role: m.role, content: m.content }));
    try {
      await runChatCompletion({ chatId, assistantMessageId: assistantId, mode: 'normal', requestMessages });
    } catch (err) {
      const error = extractReadableError(err);
      const aborted = err?.name === 'AbortError';
      updateMessagesForChat(chatId, (prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, status: aborted ? 'aborted' : 'error', error, content: m.content } : m,
        ),
      );
      try {
        await apiJson(
          apiBaseUrl,
          `/api/chats/${chatId}/messages/${encodeURIComponent(assistantId)}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '', status: aborted ? 'aborted' : 'error', error }) },
          { timeoutMs: 30000 },
        );
      } catch (e) {
        void e;
      }
      setRequestState({ status: 'idle', error });
      activeRequestRef.current = { controller: null, chatId: null, assistantMessageId: null };
    }
  };

  const handleNewChat = async () => {
    if (isGenerating) stopGenerating();
    try {
      const created = await apiJson(
        apiBaseUrl,
        '/api/chats',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Chat' }) },
        { timeoutMs: 30000 },
      );
      const session = normalizeChatSession(created) ?? normalizeChatSession(created?.item) ?? null;
      if (!session) throw new Error('Failed to create chat');
      setChatSessions((prev) => [session, ...prev]);
      setMessagesByChatId((prev) => ({ ...prev, [session.id]: [] }));
      loadedChatIdsRef.current.add(session.id);
      setCurrentChatId(session.id);
    } catch (err) {
      setDataError(extractReadableError(err));
    }
  };

  const handleSelectChat = (chat) => {
    if (isGenerating) stopGenerating();
    setCurrentChatId(chat.id);
  };

  const openAddModel = () => {
    setAddModelError('');
    setNewModelName('');
    setNewModelApiBaseUrl('');
    setNewModelType('chat.completions');
    setNewModelId('');
    setNewModelApiKey('');
    setNewModelHeaders('');
    setNewModelTemperature('');
    setNewModelMaxTokens('');
    setIsAddModelOpen(true);
  };

  const closeAddModel = () => {
    setIsAddModelOpen(false);
  };

  const saveNewModel = async () => {
    const name = newModelName.trim();
    const modelApiBaseUrl = newModelApiBaseUrl.trim();
    const type = newModelType.trim();
    const modelId = newModelId.trim();
    const apiKey = newModelApiKey;
    const headers = newModelHeaders;
    const temperature = normalizeOptionalNumber(newModelTemperature, { min: 0, max: 2 });
    const maxTokens = normalizeOptionalNumber(newModelMaxTokens, { min: 1, max: 200000 });

    if (!name || !modelApiBaseUrl) {
      setAddModelError('Model name and API endpoint are required.');
      return;
    }

    const nameExists = models.some((m) => m.name.toLowerCase() === name.toLowerCase());
    if (nameExists) {
      setAddModelError('Model name already exists.');
      return;
    }

    const parsedHeaders = parseHeadersJson(headers);
    if (parsedHeaders === null) {
      setAddModelError('Headers must be valid JSON.');
      return;
    }

    const nextModel = { name, apiBaseUrl: modelApiBaseUrl, source: 'custom', type, modelId, apiKey, headers, temperature, maxTokens };
    try {
      const created = await apiJson(
        apiBaseUrl,
        '/api/models',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextModel) },
        { timeoutMs: 30000 },
      );
      const model = normalizeModelConfig(created) ?? normalizeModelConfig(created?.item) ?? normalizeModelConfig(created?.model) ?? nextModel;
      setModels((prev) => [...prev, model]);
      setIsAddModelOpen(false);
      setDataError('');
    } catch (err) {
      setAddModelError(extractReadableError(err));
    }
  };

  const openEditModel = (model) => {
    setEditModelError('');
    setEditModelOriginalName(model.name);
    setEditModelName(model.name);
    setEditModelApiBaseUrl(model.apiBaseUrl ?? '');
    setEditModelType(model.type ?? 'chat.completions');
    setEditModelId(model.modelId ?? '');
    setEditModelApiKey(model.apiKey ?? '');
    setEditModelHeaders(model.headers ?? '');
    setEditModelTemperature(model.temperature == null ? '' : String(clampNumber(model.temperature, { min: 0, max: 2, fallback: 1 })));
    setEditModelMaxTokens(model.maxTokens == null ? '' : String(clampNumber(model.maxTokens, { min: 1, max: 200000, fallback: 1024 })));
    setIsEditModelOpen(true);
  };

  const closeEditModel = () => {
    setIsEditModelOpen(false);
    setEditModelError('');
  };

  const saveEditedModel = async () => {
    const originalName = editModelOriginalName;
    const name = editModelName.trim();
    const modelApiBaseUrl = editModelApiBaseUrl.trim();
    const type = editModelType.trim();
    const modelId = editModelId.trim();
    const apiKey = editModelApiKey;
    const headers = editModelHeaders;
    const temperature = normalizeOptionalNumber(editModelTemperature, { min: 0, max: 2 });
    const maxTokens = normalizeOptionalNumber(editModelMaxTokens, { min: 1, max: 200000 });

    if (!name || !modelApiBaseUrl) {
      setEditModelError('Model name and API endpoint are required.');
      return;
    }

    const nameExists = models.some(
      (m) => m.name.toLowerCase() === name.toLowerCase() && m.name.toLowerCase() !== originalName.toLowerCase(),
    );
    if (nameExists) {
      setEditModelError('Model name already exists.');
      return;
    }

    const parsedHeaders = parseHeadersJson(headers);
    if (parsedHeaders === null) {
      setEditModelError('Headers must be valid JSON.');
      return;
    }

    const existing = models.find((m) => m.name === originalName) ?? null;
    const updated = { ...(existing ?? {}), name, apiBaseUrl: modelApiBaseUrl, type, modelId, apiKey, headers, temperature, maxTokens };

    try {
      const id = existing?.id;
      const path = id != null ? `/api/models/${id}` : `/api/models/by-name/${encodeURIComponent(originalName)}`;
      const saved = await apiJson(
        apiBaseUrl,
        path,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) },
        { timeoutMs: 30000 },
      );
      const model = normalizeModelConfig(saved) ?? normalizeModelConfig(saved?.item) ?? updated;
      setModels((prev) => prev.map((m) => (m.name === originalName ? model : m)));
      if (selectedModel === originalName) setSelectedModel(name);
      setIsEditModelOpen(false);
      setDataError('');
    } catch (err) {
      setEditModelError(extractReadableError(err));
    }
  };

  const openDeleteModelConfirm = (e, modelName) => {
    e.preventDefault();
    setConfirmPopover({ kind: 'deleteModel', modelName, x: e.clientX, y: e.clientY });
  };

  const openDeleteChatConfirm = (e, chatId) => {
    e.preventDefault();
    setConfirmPopover({ kind: 'deleteChat', chatId, x: e.clientX, y: e.clientY });
  };

  const getPopoverStyle = (x, y) => {
    const width = 340;
    const height = 150;
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(margin, x), maxX);
    const top = Math.min(Math.max(margin, y), maxY);
    return { left, top };
  };

  const confirmDelete = async () => {
    if (!confirmPopover) return;

    if (confirmPopover.kind === 'deleteModel') {
      const modelName = confirmPopover.modelName;
      const model = models.find((m) => m.name === modelName) ?? null;
      try {
        const id = model?.id;
        const path = id != null ? `/api/models/${id}` : `/api/models/by-name/${encodeURIComponent(modelName)}`;
        await apiJson(apiBaseUrl, path, { method: 'DELETE' }, { timeoutMs: 30000 });
      } catch (error) {
        void error;
      }
      setModels((prev) => {
        const remaining = prev.filter((m) => m.name !== modelName);
        if (selectedModel === modelName) {
          setSelectedModel(remaining[0]?.name ?? '');
        }
        return remaining;
      });
    }

    if (confirmPopover.kind === 'deleteChat') {
      const chatId = confirmPopover.chatId;
      try {
        await apiJson(apiBaseUrl, `/api/chats/${chatId}`, { method: 'DELETE' }, { timeoutMs: 30000 });
      } catch (error) {
        void error;
      }
      const remaining = chatSessions.filter((c) => c.id !== chatId);
      const nextSessions = remaining;
      let nextCurrentChatId = currentChatId;

      if (chatId === currentChatId) {
        nextCurrentChatId = remaining[0]?.id ?? null;
      }

      setChatSessions(nextSessions);
      setCurrentChatId(nextCurrentChatId);
      setMessagesByChatId((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    }

    setConfirmPopover(null);
  };

  const closeSettings = () => {
    setShowSettings(false);
    setIsAddModelOpen(false);
    setAddModelError('');
    setIsEditModelOpen(false);
    setEditModelError('');
  };

  const startRenameCurrentChat = () => {
    const current = chatSessions.find((c) => c.id === currentChatId);
    if (!current) return;
    setRenameDraft(current.title);
    setIsRenamingChat(true);
  };

  const cancelRenameCurrentChat = () => {
    setIsRenamingChat(false);
    setRenameDraft('');
  };

  const saveRenameCurrentChat = async () => {
    const next = renameDraft.trim();
    if (!next) return;
    updateChatSession(currentChatId, (s) => ({ ...s, title: next, timestamp: new Date() }));
    try {
      await apiJson(
        apiBaseUrl,
        `/api/chats/${currentChatId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: next }) },
        { timeoutMs: 30000 },
      );
    } catch (error) {
      void error;
    }
    setIsRenamingChat(false);
  };

  const retryAssistant = async (assistantMessageId) => {
    if (isGenerating) return;
    const chatId = currentChatId;
    updateMessagesForChat(chatId, (prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, content: '', status: 'streaming', error: '' } : m)));
    const all = messagesByChatId[chatId] ?? [];
    const index = all.findIndex((m) => m.id === assistantMessageId);
    const context = (index >= 0 ? all.slice(0, index) : all).map((m) => ({ role: m.role, content: m.content }));
    try {
      await runChatCompletion({ chatId, assistantMessageId, mode: 'normal', requestMessages: context });
    } catch (err) {
      const error = extractReadableError(err);
      const aborted = err?.name === 'AbortError';
      updateMessagesForChat(chatId, (prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, status: aborted ? 'aborted' : 'error', error } : m)));
      setRequestState({ status: 'idle', error });
    }
  };

  const continueAssistant = async (assistantMessageId) => {
    if (isGenerating) return;
    const chatId = currentChatId;
    updateMessagesForChat(chatId, (prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, status: 'streaming', error: '' } : m)));
    const all = messagesByChatId[chatId] ?? [];
    const index = all.findIndex((m) => m.id === assistantMessageId);
    const context = (index >= 0 ? all.slice(0, index + 1) : all).map((m) => ({ role: m.role, content: m.content }));
    try {
      await runChatCompletion({ chatId, assistantMessageId, mode: 'continue', requestMessages: context });
    } catch (err) {
      const error = extractReadableError(err);
      const aborted = err?.name === 'AbortError';
      updateMessagesForChat(chatId, (prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, status: aborted ? 'aborted' : 'error', error } : m)));
      setRequestState({ status: 'idle', error });
    }
  };

  const MarkdownMessage = ({ content }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => {
            const codeChild = Array.isArray(children) ? children[0] : children;
            const codeText = typeof codeChild?.props?.children === 'string'
              ? codeChild.props.children
              : Array.isArray(codeChild?.props?.children)
                ? codeChild.props.children.join('')
                : '';
            return (
              <div className="code-block">
                <button
                  type="button"
                  className="code-copy-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(codeText);
                    } catch {
                      void 0;
                    }
                  }}
                >
                  Copy
                </button>
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className="app" title={dataError || undefined}>
      {/* Left Sidebar */}
      <div className="sidebar">
        {/* Header Section */}
        <div className="sidebar-top">
          <div className="sidebar-header">
            <h1 className="app-title">VIPER</h1>
          </div>
          <button className="settings-icon-button" onClick={() => setShowSettings(true)} title="Settings">
            <SettingOutlined />
          </button>
        </div>

        {/* Model Selector */}
        <div className="model-selector-container" ref={modelSelectorRef}>
          <button
            className="model-selector"
            disabled={models.length === 0}
            onClick={() => {
              if (models.length === 0) return;
              setShowModelDropdown(!showModelDropdown);
            }}
          >
            <span>{selectedModel || 'Select Models'}</span>
            <DownOutlined className={`dropdown-icon ${showModelDropdown ? 'open' : ''}`} />
          </button>
          {showModelDropdown && (
            <div className="model-dropdown">
              {models.map((model) => (
                <div
                  key={model.name}
                  className={`model-option ${selectedModel === model.name ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedModel(model.name);
                    setShowModelDropdown(false);
                  }}
                >
                  {model.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Chat Button */}
        <button className="new-chat-button" onClick={handleNewChat}>
          <PlusOutlined className="icon" />
          <span>New Chat</span>
        </button>

        {/* Chat History */}
        <div className="chat-history">
          <div className="chat-history-fade-top"></div>
          <div className="chat-history-list">
            {chatSessions.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => handleSelectChat(chat)}
                onContextMenu={(e) => openDeleteChatConfirm(e, chat.id)}
              >
                <div className="chat-title">{chat.title}</div>
                <div className="chat-timestamp">
                  {chat.timestamp.toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
          <div className="chat-history-fade-bottom"></div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main-chat">
        {messages.length > 0 ? (
          <>
            {/* Current Chat Title */}
            <div className="chat-title-bar">
              <div className="current-chat-card">
                {isRenamingChat ? (
                  <input
                    className="chat-title-rename-input"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRenameCurrentChat();
                      if (e.key === 'Escape') cancelRenameCurrentChat();
                    }}
                    autoFocus
                  />
                ) : (
                  <div className="chat-title" onDoubleClick={startRenameCurrentChat} title="Double-click to rename">
                    {currentChatTitle}
                  </div>
                )}
              </div>
              <div className="context-meter" title={`Context tokens (estimate): ${contextTokens}/${contextBudget}`}>
                <div className="context-meter-bar" aria-hidden="true">
                  <div className="context-meter-fill" style={{ width: `${contextPercent}%` }}></div>
                </div>
                <div className="context-meter-text">{contextTokens}/{contextBudget}</div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="messages-area" ref={messagesAreaRef}>
              {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  {message.role === 'assistant' && (
                    <div className="avatar"></div>
                  )}
                  <div className="message-content">
                    <div className="markdown">
                      <MarkdownMessage content={message.content} />
                    </div>
                    {message.role === 'assistant' && (message.status === 'error' || message.status === 'aborted') ? (
                      <div className="message-actions">
                        <div className="message-error-text">{message.error || (message.status === 'aborted' ? 'Aborted' : 'Failed')}</div>
                        <div className="message-action-buttons">
                          <button type="button" className="message-action-button" onClick={() => retryAssistant(message.id)}>
                            Retry
                          </button>
                          <button type="button" className="message-action-button" onClick={() => continueAssistant(message.id)}>
                            Continue
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="input-area">
              <form onSubmit={handleSendMessage} className="input-form">
                <div className="input-wrapper">
                  <button type="button" className="attach-button-inner" title="Attach file">
                    <PlusOutlined />
                  </button>
                  <textarea
                    ref={textareaRef}
                    className="message-input"
                    placeholder="Type your message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    rows={4}
                  />
                  {isGenerating ? (
                    <button type="button" className="send-button-inner" title="Stop generating" onClick={stopGenerating}>
                      <CloseOutlined />
                    </button>
                  ) : (
                    <button type="submit" className="send-button-inner" title="Send message">
                      <ArrowUpOutlined />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </>
        ) : (
          /* Welcome Screen */
          <div className="welcome-screen">
            <div className="welcome-content">
              <h1 className="welcome-title">VIPER</h1>
              <form onSubmit={handleSendMessage} className="input-form-welcome">
                <div className="input-wrapper">
                  <button type="button" className="attach-button-inner" title="Attach file">
                    <PlusOutlined />
                  </button>
                  <textarea
                    ref={textareaRef}
                    className="message-input"
                    placeholder="Type your message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    rows={4}
                  />
                  {isGenerating ? (
                    <button type="button" className="send-button-inner" title="Stop generating" onClick={stopGenerating}>
                      <CloseOutlined />
                    </button>
                  ) : (
                    <button type="submit" className="send-button-inner" title="Send message">
                      <ArrowUpOutlined />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div
          className="modal-overlay settings-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeSettings();
          }}
        >
          <div className="settings-modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button className="settings-close-button" onClick={closeSettings} title="Close">
                <CloseOutlined />
              </button>
            </div>

            <div className="settings-modal-body">
              <div className="settings-section">
                <div className="settings-section-header">
                  <h2>Models</h2>
                  <button className="settings-primary-button" onClick={openAddModel}>
                    Add Model
                  </button>
                </div>

                {models.length > 0 ? (
                  <div className="models-list">
                    {models.map((model) => (
                      <div
                        key={model.name}
                        className="model-row"
                        onContextMenu={(e) => openDeleteModelConfirm(e, model.name)}
                      >
                        <div className="model-row-left">
                          <button
                            className="model-edit-button"
                            onClick={() => openEditModel(model)}
                            title="Edit model"
                            type="button"
                          >
                            <EditOutlined />
                          </button>
                          <div className="model-row-info">
                            <div className="model-row-name">{model.name}</div>
                            <div className="model-row-meta">
                              <span className="model-row-source">{model.source === 'custom' ? 'Custom' : 'Built-in'}</span>
                              <span className="model-row-separator">•</span>
                              <span className="model-row-api">{model.apiBaseUrl ? model.apiBaseUrl : '—'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="settings-placeholder">No models yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && isAddModelOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAddModel();
          }}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Model</h3>
            </div>

            <div className="modal-body">
              <label className="modal-label">
                <span>Model Name</span>
                <input
                  className="modal-input"
                  value={newModelName}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelName(e.target.value);
                  }}
                  placeholder="e.g. My-GPT"
                  autoFocus
                />
              </label>

              <label className="modal-label">
                <span>API Endpoint</span>
                <input
                  className="modal-input"
                  value={newModelApiBaseUrl}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelApiBaseUrl(e.target.value);
                  }}
                  placeholder="e.g. https://api.example.com/v1"
                />
              </label>

              <label className="modal-label">
                <span>Type</span>
                <input
                  className="modal-input"
                  value={newModelType}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelType(e.target.value);
                  }}
                  placeholder="e.g. chat.completions"
                />
              </label>

              <label className="modal-label">
                <span>Model ID</span>
                <input
                  className="modal-input"
                  value={newModelId}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelId(e.target.value);
                  }}
                  placeholder="e.g. gpt-4o-mini (optional)"
                />
              </label>

              <label className="modal-label">
                <span>API Key</span>
                <input
                  className="modal-input"
                  value={newModelApiKey}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelApiKey(e.target.value);
                  }}
                  placeholder="Optional (prefer backend-managed)"
                />
              </label>

              <label className="modal-label">
                <span>Headers (JSON)</span>
                <textarea
                  className="modal-input modal-textarea"
                  value={newModelHeaders}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelHeaders(e.target.value);
                  }}
                  placeholder={'{"x-custom-header":"value"}'}
                  rows={2}
                />
              </label>

              <label className="modal-label">
                <span>Temperature</span>
                <input
                  className="modal-input"
                  type="number"
                  step="0.1"
                  value={newModelTemperature}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelTemperature(e.target.value);
                  }}
                  placeholder="Optional"
                />
              </label>

              <label className="modal-label">
                <span>Max Tokens</span>
                <input
                  className="modal-input"
                  type="number"
                  step="1"
                  value={newModelMaxTokens}
                  onChange={(e) => {
                    setAddModelError('');
                    setNewModelMaxTokens(e.target.value);
                  }}
                  placeholder="Optional"
                />
              </label>

              {addModelError ? <div className="modal-error">{addModelError}</div> : null}
            </div>

            <div className="modal-actions">
              <button className="modal-secondary-button" onClick={closeAddModel}>
                Cancel
              </button>
              <button className="modal-primary-button" onClick={saveNewModel}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && isEditModelOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEditModel();
          }}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Model</h3>
            </div>

            <div className="modal-body">
              <label className="modal-label">
                <span>Model Name</span>
                <input
                  className="modal-input"
                  value={editModelName}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelName(e.target.value);
                  }}
                  placeholder="e.g. My-GPT"
                  autoFocus
                />
              </label>

              <label className="modal-label">
                <span>API Endpoint</span>
                <input
                  className="modal-input"
                  value={editModelApiBaseUrl}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelApiBaseUrl(e.target.value);
                  }}
                  placeholder="e.g. https://api.example.com/v1"
                />
              </label>

              <label className="modal-label">
                <span>Type</span>
                <input
                  className="modal-input"
                  value={editModelType}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelType(e.target.value);
                  }}
                  placeholder="e.g. chat.completions"
                />
              </label>

              <label className="modal-label">
                <span>Model ID</span>
                <input
                  className="modal-input"
                  value={editModelId}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelId(e.target.value);
                  }}
                  placeholder="e.g. gpt-4o-mini (optional)"
                />
              </label>

              <label className="modal-label">
                <span>API Key</span>
                <input
                  className="modal-input"
                  value={editModelApiKey}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelApiKey(e.target.value);
                  }}
                  placeholder="Optional (prefer backend-managed)"
                />
              </label>

              <label className="modal-label">
                <span>Headers (JSON)</span>
                <textarea
                  className="modal-input modal-textarea"
                  value={editModelHeaders}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelHeaders(e.target.value);
                  }}
                  placeholder={'{"x-custom-header":"value"}'}
                  rows={2}
                />
              </label>

              <label className="modal-label">
                <span>Temperature</span>
                <input
                  className="modal-input"
                  type="number"
                  step="0.1"
                  value={editModelTemperature}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelTemperature(e.target.value);
                  }}
                  placeholder="Optional"
                />
              </label>

              <label className="modal-label">
                <span>Max Tokens</span>
                <input
                  className="modal-input"
                  type="number"
                  step="1"
                  value={editModelMaxTokens}
                  onChange={(e) => {
                    setEditModelError('');
                    setEditModelMaxTokens(e.target.value);
                  }}
                  placeholder="Optional"
                />
              </label>

              {editModelError ? <div className="modal-error">{editModelError}</div> : null}
            </div>

            <div className="modal-actions">
              <button className="modal-secondary-button" onClick={closeEditModel}>
                Cancel
              </button>
              <button className="modal-primary-button" onClick={saveEditedModel}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPopover ? (
        <div className="confirm-popover-overlay" onMouseDown={() => setConfirmPopover(null)}>
          <div
            className="confirm-popover-card"
            style={getPopoverStyle(confirmPopover.x, confirmPopover.y)}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-popover-title">
              {confirmPopover.kind === 'deleteModel' ? 'Delete model?' : 'Delete chat?'}
            </div>
            <div className="confirm-popover-desc">
              {confirmPopover.kind === 'deleteModel'
                ? `Delete “${confirmPopover.modelName}”?`
                : 'Delete this chat session?'}
            </div>
            <div className="confirm-popover-actions">
              <button className="modal-secondary-button" type="button" onClick={() => setConfirmPopover(null)}>
                Cancel
              </button>
              <button className="confirm-danger-button" type="button" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
