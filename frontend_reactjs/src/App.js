import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import axios from "axios";

/*
  TestAssist GeminiBot Chat App (Frontend)
  - Provides chat interface for test engineers to interact with Gemini-powered backend
  - Supports display of current chat, history, and authentication if enabled
  - Interfaces with FastAPI backend via REST endpoints as documented
*/

/** ==== CONFIG SECTION ==== **/

/*
  Backend API endpoint: default to localhost:3001, but use REACT_APP_API_BACKEND, or ?backend= param if specified.
  Allows environment-based switching for local/dev/prod.
  Example: REACT_APP_API_BACKEND=https://backend.myhost.com npm start
*/
const API_BASE =
  (() => {
    if (typeof window !== "undefined") {
      // Query param override for developer (for demo)
      const params = new URLSearchParams(window.location.search);
      if (params.get("backend")) return params.get("backend");
    }
    // Use REACT_APP_API_BASE_URL for all environments if present
    if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL;
    // Fallback to old var or localhost
    return process.env.REACT_APP_API_BACKEND || "http://localhost:3001";
  })();

// Whether authentication endpoints are enabled (backend might run in guest mode)
const AUTH_ENABLED = process.env.REACT_APP_AUTH_ENABLED === "true" || false;

// Color palette for themed components
const COLORS = {
  accent: "#43A047",
  primary: "#1976D2",
  secondary: "#424242",
};

// Intl date util: format timestamp for bubble display
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** ==== APP MAIN ==== **/
// PUBLIC_INTERFACE
export default function App() {
  // Theme: light/dark (default to "light")
  const [theme, setTheme] = useState(() => {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  // User authentication state
  const [authToken, setAuthToken] = useState(localStorage.getItem("authToken") || "");
  const [authUser, setAuthUser] = useState(localStorage.getItem("authUser") || "");
  const [authError, setAuthError] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  // Chat state
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  // History state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Profile panel
  const [panelOpen, setPanelOpen] = useState(false);

  // Chat answer file/loader/error (for answer context upload)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Track sign up/login modal toggle state for the login form
  const [signup, setSignup] = useState(false);

  // Chat scroll
  const chatEndRef = useRef(null);

  // ==== Effects and Initialization ====

  // Apply theme on document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Fetch conversation history on mount/auth change
  useEffect(() => {
    // Only fetch if authToken exists or if not required
    if (!AUTH_ENABLED || authToken) {
      fetchChatHistory();
    } else {
      setShowLogin(true);
      setMessages([]);
      setHistory([]);
    }
    // eslint-disable-next-line
  }, [authToken]);

  // Auto-scroll to end on new messages
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ==== API Calls ====

  // PUBLIC_INTERFACE
  async function fetchChatHistory() {
    try {
      const res = await axios.get(`${API_BASE}/chat/history`, {
        headers: {
          ...(AUTH_ENABLED && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      const data = res.data;
      setHistory(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        setConversationId(data[0].id);
        setMessages(
          (data[0].messages || []).map((m) => ({
            id: m.id,
            user: m.sender === "user" ? authUser || "You" : "GeminiBot",
            content: m.content,
            timestamp: m.created_at,
            role: m.sender === "user" ? "user" : (m.sender === "bot" ? "bot" : "system"),
            sources:
              m.gemini_response && m.gemini_response.sources
                ? m.gemini_response.sources
                : [],
          }))
        );
      } else {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setHistory([]);
      setConversationId(null);
      setMessages([]);
    }
  }

  // PUBLIC_INTERFACE
  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setLoading(true);

    // Optimistically add user message to UI
    const userMsg = {
      id: Date.now(),
      user: authUser || "You",
      content: text,
      timestamp: new Date().toISOString(),
      role: "user",
    };
    setMessages((msgs) => [...msgs, userMsg]);

    try {
      let reqBody = { content: text };
      if (conversationId) reqBody.conversation_id = conversationId;

      const res = await axios.post(`${API_BASE}/chat/`, reqBody, {
        headers: {
          "Content-Type": "application/json",
          ...(AUTH_ENABLED && authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {}),
        },
      });
      const botMsg = res.data;
      // If conversationId just created, reload all history/messages (for latest conversation id etc)
      if (!conversationId && botMsg && botMsg.id) {
        fetchChatHistory();
      }
      setMessages((msgs) =>
        [
          ...msgs,
          {
            id: botMsg.id,
            user: "GeminiBot",
            content: botMsg.content,
            sources: botMsg.gemini_response && botMsg.gemini_response.sources
              ? botMsg.gemini_response.sources
              : [],
            timestamp: botMsg.created_at,
            role: "bot",
          },
        ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        {
          id: `sys-${Date.now()}`,
          user: "System",
          content:
            (err?.response?.data && err.response.data.detail) ||
            err.message ||
            "Sorry, an error occurred. Please try again later.",
          role: "system",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // PUBLIC_INTERFACE
  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
      setAuthError("Provide username and password");
      return;
    }
    try {
      const payload = new URLSearchParams();
      payload.append("username", username);
      payload.append("password", password);
      payload.append("grant_type", "password");

      const res = await axios.post(`${API_BASE}/auth/token`, payload, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const data = res.data;
      setAuthToken(data.access_token);
      setAuthUser(username);
      localStorage.setItem("authToken", data.access_token);
      localStorage.setItem("authUser", username);
      setShowLogin(false);
      fetchChatHistory();
    } catch (err) {
      setAuthError("Login failed. Check credentials.");
    }
  }

  // PUBLIC_INTERFACE
  async function handleSignup(e) {
    e.preventDefault();
    setAuthError("");
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
      setAuthError("Provide username and password");
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE}/auth/signup`,
        { username, password },
        { headers: { "Content-Type": "application/json" } }
      );
      const data = res.data;
      setAuthToken(data.access_token);
      setAuthUser(username);
      localStorage.setItem("authToken", data.access_token);
      localStorage.setItem("authUser", username);
      setShowLogin(false);
      fetchChatHistory();
    } catch (err) {
      setAuthError(
        (err?.response?.data && err.response.data.detail) ||
        "Signup failed. Username may be taken."
      );
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
    setHistory([]);
    setConversationId(null);
  }

  // PUBLIC_INTERFACE
  async function handleFileUpload(evt) {
    // Upload answer .txt file for Gemini context hot-reload (admin/care)
    const file = evt.target.files[0];
    setUploadError("");
    setUploadSuccess("");
    if (!file) return;
    if (!file.name.endsWith(".txt")) {
      setUploadError("Only .txt files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API_BASE}/files/answers`, formData, {
        headers: {
          ...(AUTH_ENABLED && authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {}),
          "Content-Type": "multipart/form-data",
        },
      });
      setUploadSuccess("Answer file uploaded and Gemini context reloaded.");
      // Optional: reload chat history if context changes
      fetchChatHistory();
    } catch (err) {
      setUploadError(
        (err?.response?.data && err.response.data.detail) ||
        "Upload failed."
      );
    } finally {
      setUploading(false);
    }
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
          {/* Optional answer file upload for admins */}
          <label style={{ marginRight: "6px", fontSize: "1.02em", cursor: "pointer" }}>
            <input
              type="file"
              style={{ display: "none" }}
              accept=".txt"
              onChange={handleFileUpload}
              disabled={uploading}
              aria-label="Upload answer .txt file"
            />
            <span
              role="img"
              aria-label="Upload"
              style={{
                opacity: uploading ? 0.6 : 1,
                marginRight: "0.17em",
                fontSize: "1.06em",
              }}
              title="Upload new answer .txt file for Gemini context"
            >
              📄
            </span>
          </label>
          {uploading &&
            <span style={{
              fontSize: "0.95em", color: "#fff", marginRight: 7
            }}>
              <span className="loader" aria-label="Uploading"></span>Uploading...
            </span>
          }
          {uploadError &&
            <span style={{ color: "#e3472f", fontSize: 12, marginLeft: 4 }}>{uploadError}</span>
          }
          {uploadSuccess &&
            <span style={{ color: "#7ea157", fontSize: 12, marginLeft: 4 }}>{uploadSuccess}</span>
          }
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
            onClick={() => setTheme((p) => (p === "light" ? "dark" : "light"))}
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
    const isUser = msg.role === "user";
    const isBot = msg.role === "bot";
    // Removed unused variable isSystem
    return (
      <div
        className={
          "chat-message " +
          (isUser ? "user-message" : isBot ? "bot-message" : "system-message")
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
          onChange={(e) => setInput(e.target.value)}
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
    // Use lifted-up signup state and setSignup function
    return (
      <div className="auth-modal">
        <form
          className="login-form"
          onSubmit={signup ? handleSignup : handleLogin}
          autoComplete="off"
        >
          <h3>{signup ? "Sign up" : "Login"}</h3>
          <label>
            Username:
            <input name="username" type="text" required autoFocus />
          </label>
          <label>
            Password:
            <input name="password" type="password" required />
          </label>
          <button
            type="submit"
            style={{ background: COLORS.primary, color: "#fff" }}
          >
            {signup ? "Sign up" : "Login"}
          </button>
          <button
            type="button"
            style={{
              background: "transparent",
              color: COLORS.secondary,
              border: "none",
              marginTop: "0.7em",
              cursor: "pointer",
            }}
            onClick={() => setSignup((p) => !p)}
          >
            {signup
              ? "Already have an account? Login"
              : "Need an account? Sign up"}
          </button>
          {authError && <div className="auth-error">{authError}</div>}
        </form>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function renderHistorySelector() {
    // Show conversation history list (if multiple)
    if (!history.length) return null;
    return (
      <div style={{ textAlign: "center", marginBottom: "0.8em" }}>
        <span style={{ fontWeight: 600 }}>Past conversations:</span>
        {history.map((conv, idx) => (
          <button
            key={conv.id}
            style={{
              margin: "0 0.35em",
              background:
                conv.id === conversationId
                  ? COLORS.accent
                  : COLORS.primary,
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              padding: "0.37em 0.9em",
              cursor: "pointer",
              fontSize: "0.99em"
            }}
            onClick={() => {
              setConversationId(conv.id);
              setMessages(
                (conv.messages || []).map((m) => ({
                  id: m.id,
                  user: m.sender === "user" ? authUser || "You" : "GeminiBot",
                  content: m.content,
                  timestamp: m.created_at,
                  role: m.sender === "user" ? "user" : (m.sender === "bot" ? "bot" : "system"),
                  sources:
                    m.gemini_response && m.gemini_response.sources
                      ? m.gemini_response.sources
                      : [],
                }))
              );
            }}
          >
            {conv.title
              ? conv.title
              : `Chat #${history.length - idx}`}
          </button>
        ))}
      </div>
    );
  }

  // ===== RENDER =====
  return (
    <div className="App" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {renderChatHeader()}
      {AUTH_ENABLED && showLogin ? renderLoginForm() : null}
      {AUTH_ENABLED && panelOpen ? renderProfilePanel() : null}

      <main className="central-chat-container">
        {/* Conversation selector */}
        {renderHistorySelector()}
        {/* Main chat area */}
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
      {/* Embedded style for component-level overrides */}
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
