import { useState, useRef, useEffect } from 'react';
import { SettingOutlined, DownOutlined, ArrowUpOutlined, PlusOutlined } from '@ant-design/icons';
import './App.css';

function App() {
  const [messages, setMessages] = useState([
    { id: 1, role: 'user', content: 'Hello! How are you?' },
    { id: 2, role: 'assistant', content: 'Hello! I\'m doing well, thank you for asking. How can I assist you today?' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [chatHistory, setChatHistory] = useState(() => {
    const now = Date.now();
    return [
      { id: 1, title: 'New Chat', timestamp: new Date(now) },
      { id: 2, title: 'Previous Conversation', timestamp: new Date(now - 86400000) },
      { id: 3, title: 'Another Chat', timestamp: new Date(now - 172800000) },
      { id: 4, title: 'Old Discussion', timestamp: new Date(now - 259200000) },
      { id: 5, title: 'Sample Chat 1', timestamp: new Date(now - 345600000) },
      { id: 6, title: 'Sample Chat 2', timestamp: new Date(now - 432000000) },
    ];
  });
  const [currentChatTitle, setCurrentChatTitle] = useState('New Chat');
  const [selectedModel, setSelectedModel] = useState('GPT-4');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [models] = useState([
    'GPT-4',
    'GPT-4-Turbo',
    'GPT-3.5-Turbo',
    'Claude-3-Opus',
    'Claude-3-Sonnet',
    'llama-2-70b',
    'Mistral-Large',
  ]);

  const textareaRef = useRef(null);

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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const newMessage = {
        id: messages.length + 1,
        role: 'user',
        content: inputValue,
      };
      setMessages([...messages, newMessage]);
      setInputValue('');

      // Simulate AI response
      setTimeout(() => {
        const aiResponse = {
          id: messages.length + 2,
          role: 'assistant',
          content: 'This is a simulated response. Connect to your OpenAI-format API to get real responses.',
        };
        setMessages(prev => [...prev, aiResponse]);
      }, 500);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChatTitle('New Chat');
    const newChat = {
      id: chatHistory.length + 1,
      title: 'New Chat',
      timestamp: new Date(),
    };
    setChatHistory([newChat, ...chatHistory]);
  };

  const handleSelectChat = (chat) => {
    setCurrentChatTitle(chat.title);
    // In a real app, load messages for this chat
    setMessages([]);
  };

  if (showSettings) {
    return (
      <div className="app">
        <div className="settings-page">
          <div className="settings-header">
            <h1>Settings</h1>
            <button
              className="back-button"
              onClick={() => setShowSettings(false)}
            >
              Back to Chat
            </button>
          </div>
          <div className="settings-content">
            <p className="settings-placeholder">Settings configuration will be added here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
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
        <div className="model-selector-container">
          <button
            className="model-selector"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
          >
            <span>{selectedModel}</span>
            <DownOutlined className={`dropdown-icon ${showModelDropdown ? 'open' : ''}`} />
          </button>
          {showModelDropdown && (
            <div className="model-dropdown">
              {models.map((model) => (
                <div
                  key={model}
                  className={`model-option ${selectedModel === model ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedModel(model);
                    setShowModelDropdown(false);
                  }}
                >
                  {model}
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
            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${currentChatTitle === chat.title ? 'active' : ''}`}
                onClick={() => handleSelectChat(chat)}
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
                <div className="chat-title">{currentChatTitle}</div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="messages-area">
              {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  {message.role === 'assistant' && (
                    <div className="avatar"></div>
                  )}
                  <div className="message-content">
                    {message.content}
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
                  <button type="submit" className="send-button-inner" title="Send message">
                    <ArrowUpOutlined />
                  </button>
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
                  <button type="submit" className="send-button-inner" title="Send message">
                    <ArrowUpOutlined />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
