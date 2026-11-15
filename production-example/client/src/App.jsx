import React, { useEffect, useRef, useState } from "react";
import { command, setAccessToken, socket } from "./socket.js";

function merge(previous, incoming) {
  const records = new Map(previous.map((item) => [item._id, item]));
  for (const item of incoming) {
    const current = records.get(item._id);
    if (!current || Date.parse(item.updatedAt) >= Date.parse(current.updatedAt)) {
      records.set(item._id, item);
    }
  }
  return [...records.values()].sort((a, b) => b._id.localeCompare(a._id));
}

export function App() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [recipientId, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const pending = useRef(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    let session = 0;
    const showError = (failure) => { if (active) setError(failure.message); };
    const onMessage = (record) => setMessages((items) => merge(items, [record]));
    const onNotification = (record) => setNotifications((items) => merge(items, [record]));
    // Server registers all domain listeners before it emits session:ready.
    const onReady = async () => {
      const current = ++session;
      setConnected(true);
      try {
        // Always reconcile the latest page, even if recovery reports success.
        const [chat, inbox] = await Promise.all([
          command("chat:list", { limit: 50 }), command("notification:list", { limit: 50 }),
        ]);
        if (active && session === current) {
          setMessages((items) => merge(chat, items));
          setNotifications((items) => merge(inbox, items));
        }
      } catch (failure) { showError(failure); }
    };
    const onDisconnect = () => { session += 1; setConnected(false); };
    socket.on("session:ready", onReady);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", showError);
    socket.on("app:error", showError);
    socket.on("chat:message", onMessage);
    socket.on("notification:new", onNotification);
    socket.on("notification:updated", onNotification);
    return () => {
      active = false;
      socket.off("session:ready", onReady);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", showError);
      socket.off("app:error", showError);
      socket.off("chat:message", onMessage);
      socket.off("notification:new", onNotification);
      socket.off("notification:updated", onNotification);
      socket.disconnect();
    };
  }, []);

  const connect = () => {
    socket.disconnect();
    setMessages([]); setNotifications([]); setError("");
    pending.current = null;
    setAccessToken(token);
    socket.connect();
  };
  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setError("");
    // Retry button reuses this payload until the acknowledgement succeeds.
    pending.current ||= { requestId: crypto.randomUUID(), recipientId, body };
    try {
      const record = await command("chat:send", pending.current);
      setMessages((items) => merge(items, [record]));
      pending.current = null;
      setBody("");
    } catch (failure) { setError(failure.message); }
    finally { busy.current = false; }
  };

  return <main style={{ maxWidth: 760, margin: "2rem auto", fontFamily: "sans-serif" }}>
    <h1>Realtime messages</h1>
    <p>{connected ? "Connected" : "Disconnected"}</p>
    <p>Use a short-lived access token from your identity service.</p>
    <input aria-label="Access token" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
    <button onClick={connect}>Connect / refresh session</button>
    <hr />
    <input aria-label="Recipient ID" placeholder="Recipient ID" value={recipientId} onChange={(e) => setRecipient(e.target.value)} />
    <input aria-label="Message" placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
    <button disabled={!connected} onClick={send}>Send / retry pending message</button>
    <button onClick={() => { pending.current = null; }}>Discard pending retry</button>
    <p role="alert">{error}</p>
    <h2>Messages</h2>
    <ul>{messages.map((item) => <li key={item._id}>{item.senderId} → {item.recipientId}: {item.body}</li>)}</ul>
    <h2>Notifications</h2>
    <ul>{notifications.map((item) => <li key={item._id}>
      {item.title}: {item.body} {item.readAt ? "(read)" : <button onClick={() => {
        command("notification:read", { id: item._id }).catch((failure) => setError(failure.message));
      }}>Mark read</button>}
    </li>)}</ul>
  </main>;
}
