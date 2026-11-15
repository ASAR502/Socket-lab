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
