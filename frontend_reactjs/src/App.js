import React, { useEffect, useState, useRef } from "react";
import "./App.css";

// API base URL (adjust as needed, e.g. relative or absolute to backend_fastapi)
const API_BASE = process.env.REACT_APP_API_BACKEND || "http://localhost:3001";

// Toggle this to true if authentication endpoints are enabled on the backend
const AUTH_ENABLED = false;

// Project color palette (for inline usage if needed)
const COLORS = {
  accent: "#43A047",
  primary: "#1976D2",
  secondary: "#424242",
};

// Utility: Format date/time for chat bubbles
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// PUBLIC_INTERFACE
function App() {
  // Theme: light/dark (default to project "light" theme)
  const [theme, setTheme] = useState("light");
  // Authentication state
  const [authToken, setAuthToken] = useState(localStorage.getItem("authToken") || "");
  const [authUser, setAuthUser] = useState(localStorage.getItem("authUser") || "");
  const [authError, setAuthError] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Profile panel (optional for future)
  const [panelOpen, setPanelOpen] = useState(false);

  // Chat scroll ref
  const chatEndRef = useRef(null);

  // Scroll to bottom on message add
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set theme on document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Fetch chat history on mount or login
  useEffect(() => {
    if ((AUTH_ENABLED && authToken) || !AUTH_ENABLED) {
      fetchChatHistory();
    }
    // eslint-disable-next-line
  }, [authToken]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // Fetch chat history from backend
  // PUBLIC_INTERFACE
  async function fetchChatHistory() {
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE}/chat/history`, {
        headers: {
          "Authorization": authToken ? `Bearer ${authToken}` : undefined,
        },
      });
      if (!res.ok) throw new Error("Failed to load history");
      const history = await res.json();
      setMessages(history.messages || []);
    } catch (e) {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  // Send a new message (user query)
  // PUBLIC_INTERFACE
  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    // Optimistically add user's message to UI
    const userMsg = {
      id: Date.now(),
      user: authUser || "You",
      content: text,
      timestamp: new Date().toISOString(),
      role: "user",
    };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput("");
    setLoading(true); // Show loading indicator for Gemini/AI
    try {
      let res = await fetch(`${API_BASE}/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authToken ? `Bearer ${authToken}` : undefined,
        },
        body: JSON.stringify({ query: text }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      // Expect: { reply: "...", sources: [...] } or just { reply: "..." }
      const botMsg = {
        id: Date.now() + 1,
        user: "GeminiBot",
        content: data.reply || "No answer found.",
        sources: data.sources || [],
        timestamp: new Date().toISOString(),
        role: "bot",
      };
      setMessages((msgs) => [...msgs, botMsg]);
    } catch (e) {
      // Show error from Gemini/Backend
      setMessages((msgs) => [
        ...msgs,
        {
          id: Date.now() + 2,
          user: "System",
          content: "Sorry, an error occurred. Please try again.",
          role: "system",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // PUBLIC_INTERFACE
  function handleInput(e) {
    setInput(e.target.value);
  }

  // PUBLIC_INTERFACE
  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const form = e.target;
    const username = form.username.value;
    const password = form.password.value;
    try {
      let res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuthToken(data.token);
        setAuthUser(username);
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("authUser", username);
        setShowLogin(false);
        fetchChatHistory();
      } else {
        setAuthError("Login failed. Check credentials.");
      }
    } catch (err) {
      setAuthError("Server error.");
    }
  }

  // PUBLIC_INTERFACE
  function handleLogout() {
    setAuthToken("");
    setAuthUser("");
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    setShowLogin(true);
    setMessages([]);
  }

  // PUBLIC_INTERFACE
  function renderProfilePanel() {
    if (!AUTH_ENABLED) return null;
    return (
      <aside className={`profile-panel ${panelOpen ? "open" : ""}`}>
        <div className="profile-header">
          <span>User: <b>{authUser}</b></span>
          <button
            className="close-profile"
            title="Close"
            onClick={() => setPanelOpen(false)}
            aria-label="Close profile panel"
          >
            ×
          </button>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </aside>
    );
  }

  // PUBLIC_INTERFACE
  function renderChatHeader() {
    return (
      <div className="chat-header" style={{ background: COLORS.primary, color: "#fff" }}>
        <div style={{ fontWeight: "bold", fontSize: "1.2rem" }}>TestAssist GeminiBot</div>
        <div className="header-actions">
          {AUTH_ENABLED && (
            <button
              className="profile-btn"
              onClick={() => setPanelOpen((prev) => !prev)}
              title="User profile"
            >
              <span role="img" aria-label="profile">👤</span>
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            style={{
              marginLeft: "0.5em",
              background: COLORS.accent,
              color: "#fff"
            }}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function renderMessage(msg, idx) {
    // Differentiate style by role: user, bot, system
    const isUser = msg.role === "user";
    const isBot = msg.role === "bot";
    const isSystem = msg.role === "system";
    return (
      <div
        className={
          "chat-message " +
          (isUser
            ? "user-message"
            : isBot
            ? "bot-message"
            : "system-message")
        }
        key={msg.id || idx}
      >
        <div className="msg-metadata">
          <span className="msg-user">
            {isUser ? (authUser || "You") : isBot ? "GeminiBot" : "System"}
          </span>
          <span className="msg-time">{formatTime(msg.timestamp)}</span>
        </div>
        <div className="msg-content">
          {msg.content}
          {msg.sources && msg.sources.length > 0 && (
            <div className="msg-sources">
              <b>Sources:</b> {msg.sources.join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function renderChatInput() {
    return (
      <form className="chat-input-row" onSubmit={handleSend} autoComplete="off">
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={handleInput}
          disabled={loading}
          placeholder={
            loading
              ? "Please wait for GeminiBot…"
              : "Type your question here…"
          }
          aria-label="Chat input"
          required
          autoFocus
        />
        <button
          className="send-btn"
          style={{ background: COLORS.accent, color: "#fff" }}
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          {loading ? (
            <span className="loader" aria-label="Loading"></span>
          ) : (
            <span>Send</span>
          )}
        </button>
      </form>
    );
  }

  // PUBLIC_INTERFACE
  function renderLoginForm() {
    return (
      <div className="auth-modal">
        <form className="login-form" onSubmit={handleLogin} autoComplete="off">
          <h3>Login</h3>
          <label>
            Username:
            <input name="username" type="text" required autoFocus />
          </label>
          <label>
            Password:
            <input name="password" type="password" required />
          </label>
          <button type="submit" style={{ background: COLORS.primary, color: "#fff" }}>
            Login
          </button>
          {authError && <div className="auth-error">{authError}</div>}
        </form>
      </div>
    );
  }

  // RENDER
  return (
    <div className="App" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {renderChatHeader()}
      {AUTH_ENABLED && showLogin ? renderLoginForm() : null}
      {AUTH_ENABLED && panelOpen ? renderProfilePanel() : null}
      <main className="central-chat-container">
        <section className="chat-area" data-testid="chat-history">
          {messages.length === 0 && !loading ? (
            <div className="empty-chat-msg">Start the conversation!</div>
          ) : (
            messages.map((msg, idx) => renderMessage(msg, idx))
          )}
          {loading && (
            <div className="chat-message bot-message" key="loading-indicator">
              <div className="msg-metadata">
                <span className="msg-user">GeminiBot</span>
                <span className="msg-time">{formatTime(new Date().toISOString())}</span>
              </div>
              <div className="msg-content">
                <span className="loader" aria-label="Loading"></span> GeminiBot is typing…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </section>
        {(!AUTH_ENABLED || authToken) && renderChatInput()}
      </main>
      <footer className="chat-footer" style={{ background: COLORS.secondary, color: "#fff" }}>
        <span>
          GeminiBot &mdash; Powered by Google Gemini • Test Engineer Assistant
        </span>
      </footer>

      {/* Embedded CSS for component styling */}
      <style>{`
        .central-chat-container {
          max-width: 480px;
          margin: 2em auto;
          background: var(--bg-secondary);
          border-radius: 16px;
          min-height: 60vh;
          box-shadow: 0 4px 32px rgba(33, 58, 110, 0.10);
          display: flex;
          flex-direction: column;
          transition: background 0.3s;
        }
        .chat-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-radius: 16px 16px 0 0;
          padding: 1.2em 1.3em 0.5em 1.3em;
          box-sizing: border-box;
          min-height: 58px;
          background: ${COLORS.primary};
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.35em;
        }
        .profile-btn, .theme-toggle, .logout-btn {
          border: none;
          outline: none;
          background: ${COLORS.accent};
          color: #fff;
          font-size: 1.1rem;
          padding: 0.45em 1.1em;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.1em;
          display: flex;
          flex-direction: column;
          gap: 0.9em;
        }
        .chat-message {
          border-radius: 10px;
          max-width: 92%;
          margin: 0.1em 0;
          box-shadow: 0 1px 6px rgba(120,120,120,0.08);
          padding: 0.9em 1.2em;
          line-height: 1.54;
          font-size: 0.99rem;
          word-break: break-word;
          background: #fff;
        }
        .user-message {
          align-self: flex-end;
          background: ${COLORS.primary};
          color: #fff;
        }
        .bot-message {
          align-self: flex-start;
          background: ${COLORS.accent};
          color: #fff;
        }
        .system-message {
          align-self: center;
          background: #f6f6f6;
          color: #666;
          font-style: italic;
        }
        .msg-metadata {
          font-size: 0.78em;
          opacity: 0.68;
          display: flex;
          gap: 0.6em;
          margin-bottom: 0.28em;
        }
        .msg-user { font-weight: bold; }
        .msg-time { font-style: italic; }
        .msg-content {
          margin-top: 0.12em;
        }
        .msg-sources {
          margin-top: 0.45em;
          font-size: 0.88em;
          color: #222;
          background: #e7fdf0;
          padding: 0.3em 0.5em;
          border-radius: 5px;
        }
        .chat-input-row {
          display: flex;
          align-items: center;
          gap: 0.65em;
          border-radius: 0 0 16px 16px;
          padding: 0.8em 1.2em 1.2em 1.2em;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
        }
        .chat-input {
          flex: 1;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 1.02rem;
          padding: 0.7em 1em;
          transition: border 0.2s;
        }
        .chat-input:focus {
          border-color: ${COLORS.primary};
          outline: none;
        }
        .send-btn {
          min-width: 80px;
          min-height: 40px;
          font-size: 1rem;
          font-weight: bold;
          border-radius: 6px;
          outline: none;
          border: none;
          cursor: pointer;
        }
        .send-btn:disabled, .chat-input:disabled {
          opacity: 0.5; cursor: not-allowed;
        }
        .profile-panel {
          position: fixed;
          right: -260px;
          top: 70px;
          background: #fff;
          color: ${COLORS.secondary};
          border-radius: 12px 0 0 12px;
          box-shadow: 0 2px 16px rgba(60,80,120,0.16);
          width: 240px;
          height: 180px;
          padding: 1em;
          z-index: 20;
          transition: right 0.35s;
        }
        .profile-panel.open {
          right: 0;
        }
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1rem;
        }
        .close-profile {
          background: none;
          color: ${COLORS.secondary};
          font-size: 1.2em;
          border: none;
          cursor: pointer;
        }
        .chat-footer {
          margin-top: 0.65em;
          font-size: 0.97em;
          text-align: center;
          width: 100%;
          padding: 1em 0;
          border-radius: 0 0 12px 12px;
          background: ${COLORS.secondary};
        }
        .empty-chat-msg {
          opacity: 0.5;
          font-style: italic;
          text-align: center;
          margin: 3em 0;
        }
        .auth-modal {
          position: fixed;
          z-index: 100;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(250,250,250,0.89);
        }
        .login-form {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 2px 32px rgba(60,80,120,0.12);
          padding: 2.2em 2.5em;
          display: flex;
          flex-direction: column;
          gap: 1.2em;
          min-width: 260px;
          min-height: 220px;
        }
        .login-form h3 {
          margin-bottom: 0.5em;
          color: ${COLORS.primary};
        }
        .login-form input[type="text"],
        .login-form input[type="password"] {
          padding: 0.45em 0.95em;
          border-radius: 6px;
          border: 1px solid #ececec;
          font-size: 1em;
        }
        .auth-error {
          color: #e3472f;
          font-weight: bold;
          margin-top: 0.4em;
          text-align: center;
        }
        .loader {
          display: inline-block;
          width: 1.15em;
          height: 1.15em;
          border: 2.5px solid #bbb;
          border-top-color: ${COLORS.primary};
          border-radius: 50%;
          animation: loader-spin 0.8s linear infinite;
          margin-right: 0.7em;
          vertical-align: middle;
        }
        @keyframes loader-spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
        /* Responsive */
        @media (max-width: 600px) {
          .central-chat-container {
            margin: 0;
            min-height: 86vh;
            border-radius: 0;
          }
          .chat-header, .chat-footer {
            border-radius: 0;
          }
          .profile-panel { top: 0; border-radius: 0; }
        }
      `}</style>
    </div>
  );
}

export default App;
