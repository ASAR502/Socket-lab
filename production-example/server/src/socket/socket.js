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
