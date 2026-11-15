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
