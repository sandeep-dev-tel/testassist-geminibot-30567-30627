import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import axios from "axios";

/*
  TestAssist GeminiBot Chat App (Frontend)
  - Cleaner, wider, modern chat interface
  - Responsive and accessible by design
*/

/** ==== CONFIG SECTION ==== **/

const API_BASE =
  (() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("backend")) return params.get("backend");
    }
    if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL;
    return process.env.REACT_APP_API_BACKEND || "http://localhost:3001";
  })();
const AUTH_ENABLED = process.env.REACT_APP_AUTH_ENABLED === "true" || false;
const COLORS = {
  accent: "#43A047",
  primary: "#1976D2",
  secondary: "#424242"
};
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// PUBLIC_INTERFACE
export default function App() {
  // Theme management
  const [theme, setTheme] = useState(() =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );
  // Auth state
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

  // File upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Auth mode toggle
  const [signup, setSignup] = useState(false);

  // Chat scroll
  const chatEndRef = useRef(null);

  // Effects
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!AUTH_ENABLED || authToken) fetchChatHistory();
    else {
      setShowLogin(true);
      setMessages([]);
      setHistory([]);
    }
    // eslint-disable-next-line
  }, [authToken]);
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    } catch {
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
    const userMsg = {
      id: Date.now(),
      user: authUser || "You",
      content: text,
      timestamp: new Date().toISOString(),
      role: "user",
    };
    setMessages((msgs) => [...msgs, userMsg]);
    try {
      let reqBody = { message: { content: text } };
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
        ]
      );
    } catch (err) {
      let errorDetail = null;
      if (err?.response?.data) {
        const data = err.response.data;
        if (typeof data.detail === "object" && data.detail !== null) {
          if (Array.isArray(data.detail)) {
            errorDetail = data.detail
              .map((item) =>
                item.msg
                  ? `${item.loc ? item.loc.join(".") + ": " : ""}${item.msg}`
                  : JSON.stringify(item)
              )
              .join(" | ");
          } else {
            if (data.detail.msg) {
              errorDetail = data.detail.msg;
            } else {
              errorDetail = JSON.stringify(data.detail);
            }
          }
        } else if (typeof data.detail === "string") {
          errorDetail = data.detail;
        }
      }
      if (!errorDetail && err.message) errorDetail = err.message;
      if (!errorDetail) errorDetail = "Sorry, an error occurred. Please try again later.";
      setMessages((msgs) => [
        ...msgs,
        {
          id: `sys-${Date.now()}`,
          user: "System",
          content: errorDetail,
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
    } catch {
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
      await axios.post(`${API_BASE}/files/answers`, formData, {
        headers: {
          ...(AUTH_ENABLED && authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {}),
          "Content-Type": "multipart/form-data",
        },
      });
      setUploadSuccess("Answer file uploaded and Gemini context reloaded.");
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
        <div className="chat-title" style={{ fontWeight: 700, fontSize: "1.27rem", letterSpacing: ".01em" }}>TestAssist GeminiBot</div>
        <div className="header-actions">
          {/* Answer file upload */}
          <label title="Upload answer file" style={{ marginRight: 4, fontSize: "1.04em", cursor: "pointer" }}>
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
                opacity: uploading ? 0.55 : 1,
                fontSize: "1.1em",
              }}
              title="Upload new answer .txt file for Gemini context"
            >
              📄
            </span>
          </label>
          {uploading && (
            <span style={{
              fontSize: "0.95em", color: "#fff", marginRight: 7
            }}>
              <span className="loader" aria-label="Uploading"></span>Uploading...
            </span>
          )}
          {uploadError && (
            <span style={{ color: "#e3472f", fontSize: 12, marginLeft: 4 }}>{uploadError}</span>
          )}
          {uploadSuccess && (
            <span style={{ color: "#7ea157", fontSize: 12, marginLeft: 4 }}>{uploadSuccess}</span>
          )}
          {AUTH_ENABLED && (
            <button
              className="profile-btn"
              onClick={() => setPanelOpen((prev) => !prev)}
              title="User profile"
              style={{
                marginLeft: "0.44em"
              }}
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
    if (!history.length) return null;
    return (
      <div style={{
        display: "flex", justifyContent: "center",
        marginBottom: "1.5em", gap: "0.5em", flexWrap: "wrap"
      }}>
        {history.map((conv, idx) => (
          <button
            key={conv.id}
            style={{
              background:
                conv.id === conversationId
                  ? COLORS.accent
                  : COLORS.primary,
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "0.35em 1em",
              fontSize: "0.97em",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s"
            }}
            aria-label={conv.title ? conv.title : `Chat #${history.length - idx}`}
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
        {renderHistorySelector()}
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
      {/* Modern, wide, clean and minimal container style injected inline */}
      <style>{`
        .central-chat-container {
          width: 100%;
          max-width: 700px;
          margin: 2.2em auto;
          background: var(--bg-secondary);
          border-radius: 20px;
          min-height: 65vh;
          box-shadow: 0 4px 40px 0 rgba(33,58,110,0.09);
          display: flex;
          flex-direction: column;
          transition: background 0.3s;
        }
        .chat-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-radius: 20px 20px 0 0;
          padding: 1.4em 2em 0.7em 2em;
          box-sizing: border-box;
          min-height: 62px;
          background: ${COLORS.primary};
        }
        .chat-title {
          letter-spacing: .02em;
          font-size: 1.29rem;
          font-weight: 700;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.25em;
        }
        .profile-btn, .theme-toggle, .logout-btn {
          border: none;
          background: ${COLORS.accent};
          color: #fff;
          font-size: 1.12rem;
          padding: 0.36em 0.99em;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s;
        }
        .profile-btn, .theme-toggle {
          margin-left: 0.4em;
        }
        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.7em 1.4em 1.2em 1.4em;
          display: flex;
          flex-direction: column;
          gap: 1.2em;
        }
        .chat-message {
          border-radius: 12px;
          max-width: 92%;
          margin: 0.09em 0;
          box-shadow: 0 1px 6px rgba(120,120,120,0.04);
          padding: 1.02em 1.28em;
          line-height: 1.65;
          font-size: 1.07rem;
          word-break: break-word;
          background: #fff;
          border: none;
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
          background: #f8fafb;
          color: #777;
          font-style: italic;
          opacity: .97;
          box-shadow: none;
          padding: 0.78em 1.1em;
        }
        .msg-metadata {
          font-size: 0.83em;
          opacity: 0.68;
          display: flex;
          gap: 0.6em;
          margin-bottom: 0.2em;
          font-weight: 500;
        }
        .msg-user { font-weight: 700; }
        .msg-time { font-style: italic; }
        .msg-content {
          margin-top: 0.15em;
        }
        .msg-sources {
          margin-top: 0.48em;
          font-size: 0.95em;
          color: #222;
          background: #e7fdf0;
          padding: 0.3em 0.5em;
          border-radius: 5px;
        }
        .chat-input-row {
          display: flex;
          align-items: center;
          gap: 0.7em;
          border-radius: 0 0 20px 20px;
          padding: 1.2em 2em 1.5em 2em;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
        }
        .chat-input {
          flex: 1;
          border: 1.5px solid var(--border-color);
          border-radius: 7px;
          font-size: 1.11rem;
          padding: 0.78em 1.2em;
          background: var(--bg-primary);
          transition: border 0.2s;
        }
        .chat-input:focus {
          border-color: ${COLORS.primary};
          outline: none;
        }
        .send-btn {
          min-width: 80px;
          min-height: 44px;
          font-size: 1.04rem;
          font-weight: 600;
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
          top: 80px;
          background: #fff;
          color: ${COLORS.secondary};
          border-radius: 14px 0 0 14px;
          box-shadow: 0 2px 16px rgba(60,80,120,0.14);
          width: 240px;
          height: 180px;
          padding: 1.1em;
          z-index: 200;
          transition: right 0.33s;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1.05em;
        }
        .profile-panel.open {
          right: 0;
        }
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1em;
          width: 100%;
        }
        .close-profile {
          background: none;
          color: ${COLORS.secondary};
          font-size: 1.2em;
          border: none;
          cursor: pointer;
        }
        .chat-footer {
          margin-top: 1em;
          font-size: 1.01em;
          text-align: center;
          width: 100%;
          padding: 1.16em 0;
          border-radius: 0 0 18px 18px;
          background: ${COLORS.secondary};
          letter-spacing: 0.1px;
        }
        .empty-chat-msg {
          opacity: 0.48;
          font-style: italic;
          text-align: center;
          margin: 4em 0;
        }
        .auth-modal {
          position: fixed;
          z-index: 400;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(250,250,250,0.93);
        }
        .login-form {
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 2px 36px rgba(60,80,120,0.13);
          padding: 2.3em 2.7em;
          display: flex;
          flex-direction: column;
          gap: 1.3em;
          min-width: 270px;
          min-height: 220px;
        }
        .login-form h3 {
          margin-bottom: 0.5em;
          color: ${COLORS.primary};
        }
        .login-form input[type="text"],
        .login-form input[type="password"] {
          padding: 0.45em 0.97em;
          border-radius: 7px;
          border: 1px solid #ececec;
          font-size: 1em;
          outline: none;
        }
        .auth-error {
          color: #e3472f;
          font-weight: bold;
          margin-top: 0.4em;
          text-align: center;
        }
        .loader {
          display: inline-block;
          width: 1.2em;
          height: 1.2em;
          border: 2.6px solid #bbb;
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
        @media (max-width: 1050px) {
          .central-chat-container {
            max-width: 95vw;
            margin: 1.1em auto 1.4em auto;
            border-radius: 12px;
          }
          .chat-header, .chat-input-row {
            padding-left: 1.2em; padding-right: 1.2em;
          }
        }
        @media (max-width: 700px) {
          .central-chat-container {
            max-width: 100vw;
            min-height: 78vh;
            border-radius: 0;
            margin: 0;
          }
          .chat-header, .chat-footer {
            border-radius: 0;
            padding-left: 1em;
            padding-right: 1em;
          }
          .chat-area {
            padding-left: 0.6em;
            padding-right: 0.6em;
          }
        }
        @media (max-width: 500px) {
          .chat-area { padding: .78em .14em; gap: 0.55em; }
          .central-chat-container { min-height: 84vh; }
          .chat-input-row { padding: 1em 0.6em 0.8em 0.6em; }
        }
      `}</style>
    </div>
  );
}
