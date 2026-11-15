# Complete Socket.IO architecture and source
Read [README.md](./README.md) for setup, event contracts, authentication provisioning, data flow, delivery guarantees, tests, and deployment extensions.
This reference uses MongoDB/Mongoose and one Node process with in-memory presence. All authored runtime, configuration and test files are reproduced below; npm-generated lockfiles are supplied alongside the package files.
## Folder structure
```text
production-example/
  README.md
  ARCHITECTURE.md
  .gitignore
  client/.env.example
  client/index.html
  client/package.json
  client/src/App.jsx
  client/src/main.jsx
  client/src/socket.js
  server/.env.example
  server/package.json
  server/src/app.js
  server/src/config/db.js
  server/src/config/env.js
  server/src/lib/errors.js
  server/src/lib/validation.js
  server/src/middleware/auth.js
  server/src/models/index.js
  server/src/server.js
  server/src/services/realtimeService.js
  server/src/socket/handlers/chatHandler.js
  server/src/socket/handlers/notificationHandler.js
  server/src/socket/handlers/statusHandler.js
  server/src/socket/presence.js
  server/src/socket/registerEvent.js
  server/src/socket/rooms.js
  server/src/socket/socket.js
  server/test/persistence.test.js
  server/test/realtime.test.js
  server/package-lock.json
  client/package-lock.json
```

## `.gitignore`

```text
node_modules/
.env
dist/
```

## `client/.env.example`

```text
VITE_API_URL=http://localhost:8000
```

## `client/index.html`

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Realtime client</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
```

## `client/package.json`

```json
{
  "name": "realtime-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.8.1"
  },
  "devDependencies": {
    "vite": "^5.2.0"
  }
}
```

## `client/src/App.jsx`

```jsx
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
```

## `client/src/main.jsx`

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
```

## `client/src/socket.js`

```js
import { io } from "socket.io-client";

let accessToken;
export function setAccessToken(token) { accessToken = token; }
export const socket = io(import.meta.env.VITE_API_URL || "http://localhost:8000", {
  autoConnect: false,
  auth: (callback) => callback({ token: accessToken }),
});
export async function command(event, payload) {
  if (!socket.connected) throw new Error("Connect before sending");
  // A timeout is ambiguous: the write may already be committed. Retry using
  // the SAME requestId. IDs are generated by the UI once per logical command.
  const response = await socket.timeout(8000).emitWithAck(event, payload);
  if (response.status !== "ok") throw new Error(response.error.message);
  return response.data;
}
```

## `server/.env.example`

```text
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017/realtime
CLIENT_ORIGINS=http://localhost:5173
JWT_SECRET=replace-with-at-least-32-random-bytes
JWT_ISSUER=your-auth-service
JWT_AUDIENCE=realtime-api
```

## `server/package.json`

```json
{
  "name": "realtime-server",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node --env-file=.env src/server.js",
    "dev": "node --env-file=.env --watch src/server.js",
    "test": "node --test"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.4.4",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "socket.io-client": "^4.8.1"
  }
}
```

## `server/src/app.js`

```js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { httpAuth } from "./middleware/auth.js";
import { notificationInput } from "./lib/validation.js";
import { publicError } from "./lib/errors.js";
import { getIo } from "./socket/socket.js";
import { userRoom } from "./socket/rooms.js";

export function createApp({ origins, authenticate, service }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: origins, methods: ["GET", "POST"] }));
  app.use(express.json({ limit: "16kb" }));
  app.get("/health/ready", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ready });
  });
  app.post("/api/notifications", httpAuth(authenticate), async (req, res, next) => {
    try {
      const input = notificationInput(req.body);
      await service.authorize(req.user);
      const record = await service.createNotification(req.user, input);
      getIo().to(userRoom(req.user.tenantId, record.recipientId)).emit("notification:new", record);
      res.status(200).json({ status: "ok", data: record });
    } catch (error) { next(error); }
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      return res.status(error.status).json({ status: "error", error: { code: "INVALID_BODY", message: "Invalid or oversized JSON body" } });
    }
    res.status(error.status || 500).json({ status: "error", error: publicError(error) });
  });
  return app;
}
```

## `server/src/config/db.js`

```js
import mongoose from "mongoose";
import { Message, Notification, User } from "../models/index.js";

export async function connectDB(uri) {
  mongoose.set("bufferCommands", false);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    autoIndex: false,
  });
  // Deploy these indexes as a migration at large scale. Writes start only after
  // the unique indexes exist; otherwise concurrent retries could create duplicates.
  await Promise.all([Message.createIndexes(), Notification.createIndexes(), User.createIndexes()]);
}
```

## `server/src/config/env.js`

```js
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 8000),
  mongoUri: required("MONGODB_URI"),
  origins: required("CLIENT_ORIGINS").split(",").map((s) => s.trim()),
  jwt: {
    secret: required("JWT_SECRET"),
    issuer: required("JWT_ISSUER"),
    audience: required("JWT_AUDIENCE"),
  },
};
if (config.jwt.secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("Invalid PORT");
}
if (config.origins.some((origin) => !/^https?:\/\/[^/]+$/.test(origin))) {
  throw new Error("CLIENT_ORIGINS must contain explicit HTTP(S) origins");
}
```

## `server/src/lib/errors.js`

```js
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function publicError(error) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  console.error("Unhandled operation failure", error);
  return { code: "INTERNAL_ERROR", message: "Operation failed; retry with the same requestId" };
}
```

## `server/src/lib/validation.js`

```js
import { AppError } from "./errors.js";

export function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "Payload must be an object");
  }
  return value;
}
export function text(value, name, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new AppError("VALIDATION_ERROR", `${name} must be a nonempty string of at most ${max} characters`);
  }
  return value.trim();
}
export function id(value, name = "id") {
  const result = text(value, name, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new AppError("VALIDATION_ERROR", `Invalid ${name}`);
  return result;
}
export function mongoId(value, name = "id") {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new AppError("VALIDATION_ERROR", `Invalid ${name}`);
  }
  return value;
}
export function page(payload) {
  const input = object(payload);
  return {
    before: input.before === undefined ? undefined : mongoId(input.before, "before"),
    limit: input.limit === undefined ? 50 : (() => {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
        throw new AppError("VALIDATION_ERROR", "limit must be an integer from 1 to 100");
      }
      return input.limit;
    })(),
  };
}
export function messageInput(payload) {
  const input = object(payload);
  return { requestId: id(input.requestId, "requestId"), recipientId: id(input.recipientId, "recipientId"), body: text(input.body, "body", 4000) };
}
export function notificationInput(payload) {
  const input = object(payload);
  return { requestId: id(input.requestId, "requestId"), recipientId: id(input.recipientId, "recipientId"), title: text(input.title, "title", 150), body: text(input.body, "body", 2000) };
}
```

## `server/src/middleware/auth.js`

```js
import jwt from "jsonwebtoken";
import { AppError } from "../lib/errors.js";
import { id } from "../lib/validation.js";

export function createAuthenticator(jwtConfig) {
  return function authenticate(token) {
    try {
      if (typeof token !== "string" || token.length > 8192) throw new Error("Invalid token");
      const claims = jwt.verify(token, jwtConfig.secret, {
        algorithms: ["HS256"], issuer: jwtConfig.issuer, audience: jwtConfig.audience,
      });
      if (!Number.isInteger(claims.exp)) throw new Error("exp is required");
      return {
        userId: id(claims.sub, "sub"), tenantId: id(claims.tenantId, "tenantId"),
        roles: Array.isArray(claims.roles) ? claims.roles.filter((r) => typeof r === "string") : [],
        expiresAt: claims.exp * 1000,
      };
    } catch {
      throw new AppError("UNAUTHORIZED", "A valid, unexpired access token is required", 401);
    }
  };
}

export function socketAuth(authenticate) {
  return (socket, next) => {
    try {
      const principal = authenticate(socket.handshake.auth?.token);
      // Recovered rooms belong to the original principal. Do not let another
      // user's valid token adopt those rooms on a recovered session.
      if (socket.recovered && (socket.data.userId !== principal.userId || socket.data.tenantId !== principal.tenantId)) {
        throw new AppError("UNAUTHORIZED", "Reconnect with a new session", 401);
      }
      socket.data = principal;
      socket.userId = principal.userId;
      next();
    } catch (error) {
      const failure = new Error("Authentication failed");
      failure.data = { code: "UNAUTHORIZED", message: error.message };
      next(failure);
    }
  };
}

export function httpAuth(authenticate) {
  return (req, res, next) => {
    try {
      const header = req.get("authorization") || "";
      req.user = authenticate(header.startsWith("Bearer ") ? header.slice(7) : undefined);
      next();
    } catch (error) { next(error); }
  };
}
```

## `server/src/models/index.js`

```js
import mongoose from "mongoose";
const { Schema, model } = mongoose;
const options = { timestamps: true, versionKey: false };

// Provisioned by your existing identity service, never by socket payloads.
const user = new Schema({
  userId: { type: String, required: true },
  tenantId: { type: String, required: true },
  active: { type: Boolean, default: true },
}, options);
user.index({ tenantId: 1, userId: 1 }, { unique: true });

const common = {
  tenantId: { type: String, required: true },
  senderId: { type: String, required: true },
  recipientId: { type: String, required: true },
  requestId: { type: String, required: true },
  body: { type: String, required: true, maxlength: 4000 },
};
const message = new Schema(common, options);
message.index({ tenantId: 1, senderId: 1, requestId: 1 }, { unique: true });
message.index({ tenantId: 1, recipientId: 1, _id: -1 });
message.index({ tenantId: 1, senderId: 1, _id: -1 });

const notification = new Schema({
  ...common,
  title: { type: String, required: true, maxlength: 150 },
  readAt: { type: Date, default: null },
}, options);
notification.index({ tenantId: 1, senderId: 1, requestId: 1 }, { unique: true });
notification.index({ tenantId: 1, recipientId: 1, _id: -1 });

export const User = model("User", user);
export const Message = model("Message", message);
export const Notification = model("Notification", notification);
```

## `server/src/server.js`

```js
import { createServer } from "node:http";
import mongoose from "mongoose";
import { config } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { createAuthenticator } from "./middleware/auth.js";
import { createRealtimeService } from "./services/realtimeService.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket/socket.js";

try {
  await connectDB(config.mongoUri);
  const dependencies = { origins: config.origins, authenticate: createAuthenticator(config.jwt), service: createRealtimeService() };
  const server = createServer(createApp(dependencies));
  const io = initSocket(server, dependencies);
  server.listen(config.port, () => console.info(`Realtime server listening on ${config.port}`));
  server.on("error", (error) => { console.error(error); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    io.close(() => {
      mongoose.disconnect().then(() => process.exit(0), () => process.exit(1));
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} catch (error) {
  console.error("Startup failed", error);
  await mongoose.disconnect();
  process.exitCode = 1;
}
```

## `server/src/services/realtimeService.js`

```js
import { AppError } from "../lib/errors.js";
import { Message, Notification, User } from "../models/index.js";

async function member(tenantId, userId) {
  if (!await User.exists({ tenantId, userId, active: true })) {
    throw new AppError("FORBIDDEN", "Active tenant membership required", 403);
  }
}

async function saveOnce(Model, principal, input) {
  const key = { tenantId: principal.tenantId, senderId: principal.userId, requestId: input.requestId };
  let record;
  try {
    record = await Model.findOneAndUpdate(key, { $setOnInsert: { ...key, ...input, createdAt: new Date(), updatedAt: new Date() } }, {
      upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true,
      // Retrying a command must not change its timestamps.
      timestamps: false,
    }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    record = await Model.findOne(key).lean();
    if (!record) throw error;
  }
  for (const field of Object.keys(input)) {
    if (record[field] !== input[field]) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "requestId was already used for another payload", 409);
    }
  }
  return record;
}

export function createRealtimeService() {
  return {
    authorize: (principal) => member(principal.tenantId, principal.userId),
    async sendMessage(principal, input) {
      await member(principal.tenantId, input.recipientId);
      return saveOnce(Message, principal, input);
    },
    async createNotification(principal, input) {
      if (!principal.roles.includes("notifier")) {
        throw new AppError("FORBIDDEN", "notifier role required", 403);
      }
      await member(principal.tenantId, input.recipientId);
      return saveOnce(Notification, principal, input);
    },
    async listMessages(principal, { before, limit }) {
      return Message.find({ tenantId: principal.tenantId,
        $or: [{ senderId: principal.userId }, { recipientId: principal.userId }],
        ...(before ? { _id: { $lt: before } } : {}),
      }).sort({ _id: -1 }).limit(limit).lean();
    },
    async listNotifications(principal, { before, limit }) {
      return Notification.find({ tenantId: principal.tenantId, recipientId: principal.userId,
        ...(before ? { _id: { $lt: before } } : {}),
      }).sort({ _id: -1 }).limit(limit).lean();
    },
    async markRead(principal, notificationId) {
      const record = await Notification.findOneAndUpdate({
        _id: notificationId, tenantId: principal.tenantId, recipientId: principal.userId,
      }, [{ $set: { readAt: { $ifNull: ["$readAt", "$$NOW"] }, updatedAt: "$$NOW" } }], { new: true }).lean();
      if (!record) throw new AppError("NOT_FOUND", "Notification not found", 404);
      return record;
    },
    async status(principal, userId) { await member(principal.tenantId, userId); },
  };
}
```

## `server/src/socket/handlers/chatHandler.js`

```js
import { messageInput, page } from "../../lib/validation.js";
import { userRoom } from "../rooms.js";

export function chatHandler({ io, socket, service, on }) {
  on("chat:send", messageInput, async (input) => {
    const record = await service.sendMessage(socket.data, input);
    // One chained broadcast is a union: each tab receives this emit once.
    io.to(userRoom(socket.data.tenantId, record.recipientId))
      .to(userRoom(socket.data.tenantId, socket.data.userId)).emit("chat:message", record);
    return record;
  });
  on("chat:list", page, (input) => service.listMessages(socket.data, input));
}
```

## `server/src/socket/handlers/notificationHandler.js`

```js
import { mongoId, notificationInput, object, page } from "../../lib/validation.js";
import { userRoom } from "../rooms.js";

export function notificationHandler({ io, socket, service, on }) {
  on("notification:create", notificationInput, async (input) => {
    const record = await service.createNotification(socket.data, input);
    io.to(userRoom(socket.data.tenantId, record.recipientId)).emit("notification:new", record);
    return record;
  });
  on("notification:list", page, (input) => service.listNotifications(socket.data, input));
  on("notification:read", (payload) => mongoId(object(payload).id), async (id) => {
    const record = await service.markRead(socket.data, id);
    io.to(userRoom(socket.data.tenantId, socket.data.userId)).emit("notification:updated", record);
    return record;
  });
}
```

## `server/src/socket/handlers/statusHandler.js`

```js
import { id, object } from "../../lib/validation.js";
import { AppError } from "../../lib/errors.js";
import { statusRoom } from "../rooms.js";

export function statusHandler({ socket, service, presence, on }) {
  const validate = (payload) => id(object(payload).userId, "userId");
  async function snapshot(userId) {
    await service.status(socket.data, userId);
    return { userId, online: presence.online(socket.data.tenantId, userId) };
  }
  on("status:get", validate, snapshot);
  on("status:watch", validate, async (userId) => {
    const result = await snapshot(userId);
    const room = statusRoom(socket.data.tenantId, userId);
    if (!socket.rooms.has(room) && socket.rooms.size >= 52) {
      throw new AppError("LIMIT_EXCEEDED", "At most 50 presence subscriptions are allowed");
    }
    await socket.join(room);
    return result;
  });
  on("status:unwatch", validate, async (userId) => {
    await socket.leave(statusRoom(socket.data.tenantId, userId));
    return { userId };
  });
}
```

## `server/src/socket/presence.js`

```js
import { userRoom } from "./rooms.js";

export function createPresence() {
  const users = new Map();
  return {
    add(principal, socketId) {
      const key = userRoom(principal.tenantId, principal.userId);
      const first = !users.has(key);
      if (first) users.set(key, new Set());
      users.get(key).add(socketId);
      return first;
    },
    remove(principal, socketId) {
      const key = userRoom(principal.tenantId, principal.userId);
      const sockets = users.get(key);
      sockets?.delete(socketId);
      if (sockets?.size === 0) { users.delete(key); return true; }
      return false;
    },
    online(tenantId, userId) { return users.has(userRoom(tenantId, userId)); },
  };
}
```

## `server/src/socket/registerEvent.js`

```js
import { AppError, publicError } from "../lib/errors.js";

export function createEventRegistrar(socket, service) {
  let windowStart = Date.now();
  let count = 0;
  let pending = 0;
  return function on(event, validate, handle) {
    socket.on(event, async (payload, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      let admitted = false;
      try {
        if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0; }
        if (++count > 100 || pending >= 8) throw new AppError("RATE_LIMITED", "Too many requests", 429);
        if (Date.now() >= socket.data.expiresAt) throw new AppError("UNAUTHORIZED", "Access token expired", 401);
        const input = validate(payload);
        pending += 1;
        admitted = true;
        await service.authorize(socket.data);
        const data = await handle(input);
        reply({ status: "ok", data });
      } catch (error) {
        const failure = { event, ...publicError(error) };
        reply({ status: "error", error: failure });
        socket.emit("app:error", failure);
      } finally {
        if (admitted) pending -= 1;
      }
    });
  };
}
```

## `server/src/socket/rooms.js`

```js
// Prefixes prevent collisions with Socket.IO's automatic socket-ID rooms.
export const userRoom = (tenantId, userId) => `user:${tenantId}:${userId}`;
export const statusRoom = (tenantId, userId) => `presence:${tenantId}:${userId}`;
```

## `server/src/socket/socket.js`

```js
import { Server } from "socket.io";
import { socketAuth } from "../middleware/auth.js";
import { createPresence } from "./presence.js";
import { createEventRegistrar } from "./registerEvent.js";
import { chatHandler } from "./handlers/chatHandler.js";
import { notificationHandler } from "./handlers/notificationHandler.js";
import { statusHandler } from "./handlers/statusHandler.js";
import { statusRoom, userRoom } from "./rooms.js";

let io;
export function initSocket(server, { origins, authenticate, service }) {
  if (io) throw new Error("Socket.IO already initialized");
  io = new Server(server, {
    cors: { origin: origins, methods: ["GET", "POST"] },
    // CORS alone does not restrict WebSocket upgrades. Non-browser clients may
    // omit Origin and still must authenticate with JWT.
    allowRequest: (req, callback) => callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
    connectionStateRecovery: { maxDisconnectionDuration: 120000, skipMiddlewares: false },
    maxHttpBufferSize: 16384,
  });
  const presence = createPresence();
  io.use(socketAuth(authenticate));
  // Middleware completes before "connection", so no domain listeners race setup.
  io.use((socket, next) => {
    service.authorize(socket.data).then(() => next(), () => {
      const error = new Error("Active membership required");
      error.data = { code: "FORBIDDEN", message: "Active membership required" };
      next(error);
    });
  });
  io.on("connection", (socket) => {
    const principal = socket.data;
    socket.join(userRoom(principal.tenantId, principal.userId));
    if (presence.add(principal, socket.id)) {
      io.to(statusRoom(principal.tenantId, principal.userId)).emit("status:changed", { userId: principal.userId, online: true });
    }
    const on = createEventRegistrar(socket, service);
    const context = { io, socket, service, presence, on };
    chatHandler(context);
    notificationHandler(context);
    statusHandler(context);
    // Check periodically to support access tokens longer than setTimeout's limit.
    const expiryTimer = setInterval(() => {
      if (Date.now() >= principal.expiresAt) {
        socket.emit("app:error", { code: "UNAUTHORIZED", message: "Access token expired" });
        socket.disconnect(true);
      }
    }, 1000);
    expiryTimer.unref();
    socket.on("disconnect", () => {
      clearInterval(expiryTimer);
      if (presence.remove(principal, socket.id)) {
        io.to(statusRoom(principal.tenantId, principal.userId)).emit("status:changed", { userId: principal.userId, online: false });
      }
    });
    socket.emit("session:ready", { userId: principal.userId, recovered: socket.recovered });
  });
  return io;
}
export function getIo() {
  if (!io) throw new Error("Socket.IO has not been initialized");
  return io;
}
```

## `server/test/persistence.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { Message, Notification, User } from "../src/models/index.js";
import { createRealtimeService } from "../src/services/realtimeService.js";

test("MongoDB idempotency, tenant authorization, and read ownership", {
  skip: !process.env.TEST_MONGODB_URI,
}, async (t) => {
  await connectDB(process.env.TEST_MONGODB_URI);
  const tenantId = `test-${randomUUID()}`;
  t.after(async () => {
    await Promise.all([User.deleteMany({ tenantId }), Message.deleteMany({ tenantId }), Notification.deleteMany({ tenantId })]);
    await mongoose.disconnect();
  });
  await User.create([{ tenantId, userId: "alice" }, { tenantId, userId: "bob" }]);
  const service = createRealtimeService();
  const alice = { tenantId, userId: "alice", roles: ["notifier"] };
  const bob = { tenantId, userId: "bob", roles: [] };
  const input = { requestId: randomUUID(), recipientId: "bob", body: "Hello" };
  const saved = await Promise.all(Array.from({ length: 8 }, () => service.sendMessage(alice, input)));
  assert.equal(new Set(saved.map((record) => String(record._id))).size, 1);
  assert.equal(await Message.countDocuments({ tenantId }), 1);
  assert.ok(saved[0].createdAt instanceof Date);
  await assert.rejects(service.sendMessage(alice, { ...input, body: "Different" }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(service.sendMessage(alice, { ...input, requestId: randomUUID(), recipientId: "outsider" }), { code: "FORBIDDEN" });
  await assert.rejects(service.createNotification(bob, { ...input, title: "Denied" }), { code: "FORBIDDEN" });
  const notification = await service.createNotification(alice, { ...input, title: "Notice" });
  await assert.rejects(service.markRead(alice, notification._id), { code: "NOT_FOUND" });
  const first = await service.markRead(bob, notification._id);
  const second = await service.markRead(bob, notification._id);
  assert.equal(first.readAt.getTime(), second.readAt.getTime());
  assert.equal((await service.listNotifications(alice, { limit: 50 })).length, 0);
  assert.equal((await service.listNotifications(bob, { limit: 50 })).length, 1);
});
```

## `server/test/realtime.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import jwt from "jsonwebtoken";
import { io as client } from "socket.io-client";
import { createAuthenticator, socketAuth } from "../src/middleware/auth.js";
import { initSocket, getIo } from "../src/socket/socket.js";
import { AppError } from "../src/lib/errors.js";

const jwtConfig = { secret: "test-secret-with-at-least-32-characters", issuer: "test-auth", audience: "test-api" };
const authenticate = createAuthenticator(jwtConfig);
function token(userId, tenantId = "acme", options = {}) {
  return jwt.sign({ tenantId, roles: ["notifier"] }, jwtConfig.secret, {
    subject: userId, issuer: jwtConfig.issuer, audience: jwtConfig.audience, expiresIn: "1h", ...options,
  });
}

test("authenticated real-time event routing", async (t) => {
  const server = createServer();
  let writeCount = 0;
  let fail = false;
  let unblock;
  const service = {
    async authorize() {},
    async sendMessage(principal, input) {
      writeCount += 1;
      if (fail) throw new AppError("DATABASE_UNAVAILABLE", "Database unavailable", 503);
      if (unblock) await new Promise((resolve) => { unblock.resolve = resolve; });
      return { _id: "0123456789abcdef01234567", ...input, senderId: principal.userId };
    },
    async status() {},
    async listMessages() { return []; },
    async listNotifications() { return []; },
  };
  const io = initSocket(server, { origins: ["http://localhost:5173"], authenticate, service });
  assert.equal(getIo(), io);
  assert.throws(() => initSocket(server, {}), /already initialized/);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => io.close(resolve));
  });
  async function connect(userId, tenantId = "acme") {
    const socket = client(url, { autoConnect: false, forceNew: true, reconnection: false, auth: { token: token(userId, tenantId) } });
    sockets.push(socket);
    const ready = once(socket, "session:ready");
    socket.connect();
    await ready;
    return socket;
  }
  async function command(socket, event, payload) { return socket.timeout(1500).emitWithAck(event, payload); }

  await t.test("invalid and expired JWTs are rejected", async () => {
    for (const accessToken of ["bad-token", token("expired", "acme", { expiresIn: -1 })]) {
      const socket = client(url, { autoConnect: false, reconnection: false, auth: { token: accessToken } });
      sockets.push(socket);
      const rejected = once(socket, "connect_error");
      socket.connect();
      const [error] = await rejected;
      assert.equal(error.data.code, "UNAUTHORIZED");
      assert.equal(socket.connected, false);
    }
  });
  const alice = await connect("alice");
  const bobTab1 = await connect("bob");
  const bobTab2 = await connect("bob");
  const otherTenant = await connect("bob", "other");

  await t.test("save completes before acknowledgement or recipient delivery", async () => {
    const received = [];
    const events = [alice, bobTab1, bobTab2, otherTenant].map((socket, index) => {
      const listener = () => received.push(index);
      socket.on("chat:message", listener);
      return [socket, listener];
    });
    unblock = {};
    let acknowledged = false;
    const response = command(alice, "chat:send", { requestId: "request-1", recipientId: "bob", body: "Hello" })
      .then((value) => { acknowledged = true; return value; });
    for (let i = 0; i < 100 && !unblock.resolve; i += 1) await delay(5);
    assert.equal(typeof unblock.resolve, "function");
    assert.deepEqual(received, []);
    assert.equal(acknowledged, false);
    unblock.resolve();
    const result = await response;
    unblock = undefined;
    await delay(30);
    assert.equal(result.status, "ok");
    assert.equal(result.data.senderId, "alice");
    assert.deepEqual(received.sort(), [0, 1, 2]);
    events.forEach(([socket, listener]) => socket.off("chat:message", listener));
  });
  await t.test("malformed payload does not reach persistence", async () => {
    const before = writeCount;
    const result = await command(alice, "chat:send", { recipientId: "bob", body: "" });
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(writeCount, before);
  });
  await t.test("persistence errors return a structured error and emit no message", async () => {
    let deliveries = 0;
    const listener = () => { deliveries += 1; };
    bobTab1.on("chat:message", listener);
    fail = true;
    const result = await command(alice, "chat:send", { requestId: "request-2", recipientId: "bob", body: "Fails" });
    fail = false;
    await delay(20);
    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATABASE_UNAVAILABLE");
    assert.equal(deliveries, 0);
    bobTab1.off("chat:message", listener);
  });
  await t.test("presence stays online until the final tab disconnects", async () => {
    const changes = [];
    const onChange = (value) => changes.push(value);
    alice.on("status:changed", onChange);
    await command(alice, "status:watch", { userId: "bob" });
    const status = async () => (await command(alice, "status:get", { userId: "bob" })).data.online;
    assert.equal(await status(), true);
    bobTab1.disconnect();
    await delay(20);
    assert.equal(await status(), true);
    bobTab2.disconnect();
    await delay(20);
    assert.equal(await status(), false);
    assert.deepEqual(changes, [{ userId: "bob", online: false }]);
    alice.off("status:changed", onChange);
  });
});

test("recovered sessions cannot change their user or tenant", () => {
  const middleware = socketAuth(authenticate);
  const socket = { recovered: true, data: { userId: "alice", tenantId: "acme" }, handshake: { auth: { token: token("bob") } } };
  let failure;
  middleware(socket, (error) => { failure = error; });
  assert.equal(failure.data.code, "UNAUTHORIZED");
});
```
