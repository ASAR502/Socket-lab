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
