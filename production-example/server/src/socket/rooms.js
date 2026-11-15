// Prefixes prevent collisions with Socket.IO's automatic socket-ID rooms.
export const userRoom = (tenantId, userId) => `user:${tenantId}:${userId}`;
export const statusRoom = (tenantId, userId) => `presence:${tenantId}:${userId}`;
