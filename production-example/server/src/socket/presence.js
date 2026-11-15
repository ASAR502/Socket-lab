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
