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
