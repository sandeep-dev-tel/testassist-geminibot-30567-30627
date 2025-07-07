import React, { useEffect, useState, useRef } from "react";
import "./App.css";

/*
  AI Chat Assistant Chat App (Frontend)
  - Provides chat interface for a Gemini-powered assistant.
  - Uses the layout and styles from assets/ai_chat_assistant_design_notes.md.
*/

const API_BASE =
  (() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("backend")) return params.get("backend");
    }
    return process.env.REACT_APP_API_BACKEND || "https://vscode-internal-8510-beta.beta01.cloud.kavia.ai:3001";
  })();

const AUTH_ENABLED = false;

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// PUBLIC_INTERFACE
export default function App() {
  const [theme, setTheme] = useState(() => {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [authToken, setAuthToken] = useState(localStorage.getItem("authToken") || "");
  const [authUser, setAuthUser] = useState(localStorage.getItem("authUser") || "");
  const [authError, setAuthError] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [signup, setSignup] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!AUTH_ENABLED || authToken) {
      fetchChatHistory();
    } else {
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
      const res = await fetch(`${API_BASE}/chat/history`, {
        headers: {
          ...(AUTH_ENABLED && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Error loading chat history");
      const data = await res.json();
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
      if (conversationId !== null && conversationId !== undefined) reqBody.conversation_id = conversationId;

      const res = await fetch(`${API_BASE}/chat/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(AUTH_ENABLED && authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {}),
        },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) {
        let detail = "Failed to get response. Try again.";
        try {
          const err = await res.json();
          if (err && err.detail) detail = err.detail;
        } catch { }
        throw new Error(detail);
      }
      const botMsg = await res.json();
      if (!conversationId && botMsg && botMsg.id && res.headers.get("content-type")?.includes("application/json")) {
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

  // AUTH handlers (only relevant if AUTH_ENABLED; left for completeness)
  async function handleLogin(e) { /* ... unchanged ... */ }
  async function handleSignup(e) { /* ... unchanged ... */ }
  function handleLogout() { /* ... unchanged ... */ }

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
    // More minimal/professional: just the title, no right-aligned avatar/buttons
    return (
      <header className="chat-header">
        <span className="header-title">AI Chat Assistant</span>
      </header>
    );
  }

  // PUBLIC_INTERFACE
  function renderMessage(msg, idx) {
    const isUser = msg.role === "user";
    const isBot = msg.role === "bot";
    function renderContentSafe(content) {
      if (typeof content === "string") return content;
      if (content === null || content === undefined) return "";
      if (typeof content === "object") {
        if (typeof content.answer === "string") return content.answer;
        try { return JSON.stringify(content); } catch { return "[Unreadable content]"; }
      }
      return String(content);
    }
    // For edge-aligned bubbles and external timestamp:
    const bubbleClass =
      "chat-message " +
      (isUser ? "user-message" : isBot ? "bot-message" : "system-message");
    const containerStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : isBot ? "flex-start" : "center",
      marginBottom: "2px"
    };
    return (
      <div style={containerStyle} key={msg.id || idx}>
        <div className={bubbleClass}>
          {/* No timestamp here now */}
          <div className="msg-metadata" style={{marginBottom: 0}}>
            <span className="msg-user">
              {isUser ? (authUser || "You") : isBot ? "GeminiBot" : "System"}
            </span>
          </div>
          <div className="msg-content">
            {renderContentSafe(msg.content)}
            {msg.sources && msg.sources.length > 0 && (
              <div className="msg-sources">
                <b>Sources:</b> {msg.sources.join(", ")}
              </div>
            )}
          </div>
        </div>
        {/* Timestamp outside bubble, bottom right edge for both user and bot */}
        <span
          className="msg-time outside-bubble-time"
          style={{
            fontSize: "11px",
            marginTop: "4px",
            color: "var(--input-placeholder)",
            alignSelf: isUser ? "flex-end" : isBot ? "flex-start" : "center",
            opacity: 0.95
          }}
        >
          {formatTime(msg.timestamp)}
        </span>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function renderChatInput() {
    return (
      <form className="chat-input-row" onSubmit={handleSend} autoComplete="off" style={{ paddingBottom: 0 }}>
        <input
          className="chat-input"
          style={{ fontFamily: "inherit", border: "none", boxShadow: "none" }}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Type your message..."
          aria-label="Chat input"
          required
          autoFocus
        />
        <button
          className="send-btn"
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send"
          tabIndex={0}
        >
          {loading ? (
            <span className="loader" aria-label="Loading"></span>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path d="M3.07 10.38l12.38-4.66c1.15-.43 2.1.52 1.67 1.67l-4.66 12.38c-.46 1.21-1.91 1.32-2.38.09l-1.37-3.65-3.65-1.37c-1.23-.46-1.12-1.92.09-2.38z"></path>
            </svg>
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
            style={{
              background: "var(--primary-accent)",
              color: "#fff",
              border: "none"
            }}
          >
            {signup ? "Sign up" : "Login"}
          </button>
          <button
            type="button"
            style={{
              background: "transparent",
              color: "#B0B9C6",
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
      <div style={{ textAlign: "center", marginBottom: "0.6em" }}>
        <span style={{ fontWeight: 600, color: "#B0B9C6" }}>Past conversations:</span>
        {history.map((conv, idx) => (
          <button
            key={conv.id}
            style={{
              margin: "0 0.35em",
              background:
                conv.id === conversationId
                  ? "var(--primary-accent)"
                  : "#232E41",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.30em 0.9em",
              cursor: "pointer",
              fontSize: "0.95em"
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

  // Render core layout
  return (
    <div className="App">
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
      <footer className="chat-footer">
        <span>
          AI Chat Assistant &mdash; Powered by Gemini • Test Engineer Helper
        </span>
      </footer>
    </div>
  );
}
