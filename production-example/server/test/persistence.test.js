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
