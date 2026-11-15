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
