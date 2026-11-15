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
