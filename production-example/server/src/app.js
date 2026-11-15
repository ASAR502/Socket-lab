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
