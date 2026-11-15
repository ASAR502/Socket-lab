import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import jwt from "jsonwebtoken";
import { io as client } from "socket.io-client";
import { createAuthenticator, socketAuth } from "../src/middleware/auth.js";
import { initSocket, getIo } from "../src/socket/socket.js";
import { AppError } from "../src/lib/errors.js";

const jwtConfig = { secret: "test-secret-with-at-least-32-characters", issuer: "test-auth", audience: "test-api" };
const authenticate = createAuthenticator(jwtConfig);
function token(userId, tenantId = "acme", options = {}) {
  return jwt.sign({ tenantId, roles: ["notifier"] }, jwtConfig.secret, {
    subject: userId, issuer: jwtConfig.issuer, audience: jwtConfig.audience, expiresIn: "1h", ...options,
  });
}

test("authenticated real-time event routing", async (t) => {
  const server = createServer();
  let writeCount = 0;
  let fail = false;
  let unblock;
  const service = {
    async authorize() {},
    async sendMessage(principal, input) {
      writeCount += 1;
      if (fail) throw new AppError("DATABASE_UNAVAILABLE", "Database unavailable", 503);
      if (unblock) await new Promise((resolve) => { unblock.resolve = resolve; });
      return { _id: "0123456789abcdef01234567", ...input, senderId: principal.userId };
    },
    async status() {},
    async listMessages() { return []; },
    async listNotifications() { return []; },
  };
  const io = initSocket(server, { origins: ["http://localhost:5173"], authenticate, service });
  assert.equal(getIo(), io);
  assert.throws(() => initSocket(server, {}), /already initialized/);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => io.close(resolve));
  });
  async function connect(userId, tenantId = "acme") {
    const socket = client(url, { autoConnect: false, forceNew: true, reconnection: false, auth: { token: token(userId, tenantId) } });
    sockets.push(socket);
    const ready = once(socket, "session:ready");
    socket.connect();
    await ready;
    return socket;
  }
  async function command(socket, event, payload) { return socket.timeout(1500).emitWithAck(event, payload); }

  await t.test("invalid and expired JWTs are rejected", async () => {
    for (const accessToken of ["bad-token", token("expired", "acme", { expiresIn: -1 })]) {
      const socket = client(url, { autoConnect: false, reconnection: false, auth: { token: accessToken } });
      sockets.push(socket);
      const rejected = once(socket, "connect_error");
      socket.connect();
      const [error] = await rejected;
      assert.equal(error.data.code, "UNAUTHORIZED");
      assert.equal(socket.connected, false);
    }
  });
  const alice = await connect("alice");
  const bobTab1 = await connect("bob");
  const bobTab2 = await connect("bob");
  const otherTenant = await connect("bob", "other");

  await t.test("save completes before acknowledgement or recipient delivery", async () => {
    const received = [];
    const events = [alice, bobTab1, bobTab2, otherTenant].map((socket, index) => {
      const listener = () => received.push(index);
      socket.on("chat:message", listener);
      return [socket, listener];
    });
    unblock = {};
    let acknowledged = false;
    const response = command(alice, "chat:send", { requestId: "request-1", recipientId: "bob", body: "Hello" })
      .then((value) => { acknowledged = true; return value; });
    for (let i = 0; i < 100 && !unblock.resolve; i += 1) await delay(5);
    assert.equal(typeof unblock.resolve, "function");
    assert.deepEqual(received, []);
    assert.equal(acknowledged, false);
    unblock.resolve();
    const result = await response;
    unblock = undefined;
    await delay(30);
    assert.equal(result.status, "ok");
    assert.equal(result.data.senderId, "alice");
    assert.deepEqual(received.sort(), [0, 1, 2]);
    events.forEach(([socket, listener]) => socket.off("chat:message", listener));
  });
  await t.test("malformed payload does not reach persistence", async () => {
    const before = writeCount;
    const result = await command(alice, "chat:send", { recipientId: "bob", body: "" });
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(writeCount, before);
  });
  await t.test("persistence errors return a structured error and emit no message", async () => {
    let deliveries = 0;
    const listener = () => { deliveries += 1; };
    bobTab1.on("chat:message", listener);
    fail = true;
    const result = await command(alice, "chat:send", { requestId: "request-2", recipientId: "bob", body: "Fails" });
    fail = false;
    await delay(20);
    assert.equal(result.status, "error");
    assert.equal(result.error.code, "DATABASE_UNAVAILABLE");
    assert.equal(deliveries, 0);
    bobTab1.off("chat:message", listener);
  });
  await t.test("presence stays online until the final tab disconnects", async () => {
    const changes = [];
    const onChange = (value) => changes.push(value);
    alice.on("status:changed", onChange);
    await command(alice, "status:watch", { userId: "bob" });
    const status = async () => (await command(alice, "status:get", { userId: "bob" })).data.online;
    assert.equal(await status(), true);
    bobTab1.disconnect();
    await delay(20);
    assert.equal(await status(), true);
    bobTab2.disconnect();
    await delay(20);
    assert.equal(await status(), false);
    assert.deepEqual(changes, [{ userId: "bob", online: false }]);
    alice.off("status:changed", onChange);
  });
});

test("recovered sessions cannot change their user or tenant", () => {
  const middleware = socketAuth(authenticate);
  const socket = { recovered: true, data: { userId: "alice", tenantId: "acme" }, handshake: { auth: { token: token("bob") } } };
  let failure;
  middleware(socket, (error) => { failure = error; });
  assert.equal(failure.data.code, "UNAUTHORIZED");
});
