import { AppError, publicError } from "../lib/errors.js";

export function createEventRegistrar(socket, service) {
  let windowStart = Date.now();
  let count = 0;
  let pending = 0;
  return function on(event, validate, handle) {
    socket.on(event, async (payload, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      let admitted = false;
      try {
        if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0; }
        if (++count > 100 || pending >= 8) throw new AppError("RATE_LIMITED", "Too many requests", 429);
        if (Date.now() >= socket.data.expiresAt) throw new AppError("UNAUTHORIZED", "Access token expired", 401);
        const input = validate(payload);
        pending += 1;
        admitted = true;
        await service.authorize(socket.data);
        const data = await handle(input);
        reply({ status: "ok", data });
      } catch (error) {
        const failure = { event, ...publicError(error) };
        reply({ status: "error", error: failure });
        socket.emit("app:error", failure);
      } finally {
        if (admitted) pending -= 1;
      }
    });
  };
}
