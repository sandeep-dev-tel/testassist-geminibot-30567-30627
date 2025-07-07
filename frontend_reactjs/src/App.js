import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Version compatibility notes:
// - react-markdown@9.x uses pure ESM, plugins must also be ESM.
// - remark-gfm@3.x and rehype-highlight@6.x are recommended.
// Proper plugin props: 'remarkPlugins' and 'rehypePlugins'.

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
    const isSystem = msg.role === "system";
    // For bot/system, render using markdown renderer, else plain text
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
        <div className="msg-content markdown-content">
          {(isBot || isSystem) ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // render <a> tags with target _blank
                a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          ) : (
            msg.content
          )}
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
    <div className="App" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", width: "100vw", minHeight: "100vh", padding: 0, margin: 0 }}>
      {renderChatHeader()}
      {AUTH_ENABLED && showLogin ? renderLoginForm() : null}
      {AUTH_ENABLED && panelOpen ? renderProfilePanel() : null}

      <main className="central-chat-container" style={{ width: "100vw", maxWidth: "100vw", margin: 0, borderRadius: 0, padding: 0 }}>
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
              <div className="msg-content markdown-content">
                <span className="loader" aria-label="Loading"></span> GeminiBot is typing…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </section>
        {(!AUTH_ENABLED || authToken) && renderChatInput()}
      </main>
      <footer className="chat-footer" style={{ background: COLORS.secondary, color: "#fff", width: "100vw", borderRadius: 0 }}>
        <span>
          GeminiBot &mdash; Powered by Google Gemini • Test Engineer Assistant
        </span>
      </footer>
    </div>
  );
}
