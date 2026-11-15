# Modular Socket.IO reference

This self-contained implementation uses Node.js 22+, Express 4, Socket.IO 4,
MongoDB with Mongoose, and React/Vite. Presence and recovery buffers live in one
Node process. Your existing application is preserved outside this directory.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete folder structure and
source code of every file. The corresponding files here are runnable.

## Run

Start MongoDB locally or supply an Atlas connection string. In two terminals:

```sh
cd production-example/server
cp .env.example .env
# Edit .env: set MongoDB URI, JWT secret, issuer, audience, and allowed origins.
npm ci
npm start
```

```sh
cd production-example/client
cp .env.example .env
npm ci
npm run dev
```

The API defaults to port 8000 and the client to port 5173. If Vite selects another
port, update CLIENT_ORIGINS or free port 5173. VITE_ variables are public; never put
JWT_SECRET in the client environment. Put TLS termination and HTTP/connection
rate limits at your reverse proxy. Use a secret manager in production.

## Identity and authorization

This reference integrates with an existing identity service. It deliberately has
no public endpoint for minting tokens or assigning roles. The identity service
must provision active users in the `users` collection, using this shape:

```js
{ userId: "alice", tenantId: "acme", active: true }
{ userId: "bob", tenantId: "acme", active: true }
```

Issue a short-lived HS256 JWT with these verified claims:

```js
{
  sub: "alice", tenantId: "acme", roles: ["notifier"],
  iss: "your-auth-service", aud: "realtime-api",
  exp: /* NumericDate in seconds */
}
```

Use exactly the configured issuer, audience and signing secret. Only trusted
issuers grant `notifier`; ordinary users should have `roles: []`. Identifiers
contain letters, digits, underscores and hyphens, up to 128 characters.

Paste the issued access token into the demonstration UI. Production applications
should supply an access token from their authenticated session to setAccessToken,
keep it in memory, and disconnect on logout. Renew a token through your identity
service, then explicitly reconnect. Authentication failures do not automatically
refresh tokens. All devices connect separately with their own valid tokens.

Membership is verified on connection and before every domain command. Recipients
must be active members of the same tenant. This example permits direct messages
between any two active members of a tenant. Add contact, block-list or conversation
membership checks inside the service when your business policy requires them.
Read operations are always scoped to the authenticated owner/participants.

A recovered session cannot change identity. Middleware runs again on recovery.
Connections are disconnected within a second of access-token expiry; commands
check expiry immediately. JWT role revocation takes effect when the token expires
or the session reconnects; membership changes take effect on the next command.
For immediate revocation, integrate your identity service's revocation feed and
disconnect all sockets in the user's room. Existing presence subscriptions also
need revocation through that integration.

## Client → database → recipient

1. React emits `chat:send` with `{ requestId, recipientId, body }` and an ack callback.
   The sender ID, tenant and roles come exclusively from the verified JWT.
2. The registrar validates the payload, enforces per-connection rate/concurrency
   limits, checks expiry and verifies active membership. The service authorizes
   the recipient and persists using an indexed idempotency key.
3. After MongoDB confirms the write, the handler broadcasts `chat:message` to the
   union of the sender's and recipient's private rooms. Every connected device
   in those rooms receives the event.
4. The sender receives `{ status: "ok", data: savedRecord }`. A failed operation
   receives `{ status: "error", error: { event, code, message } }` and `app:error`.
   Handshake failures arrive as `connect_error` with an `error.data` object.

`status: "ok"` confirms persistence and server-side broadcast submission. It does
not confirm recipient delivery or reading. `notification:read` explicitly persists
read state. Add a separate persisted receipt command for chat delivery/read
receipts if those are required.

The notification socket handler and REST controller use the same service. For
example, an authenticated HTTP request can trigger a persisted private emit:

```http
POST /api/notifications
Authorization: Bearer <notifier-access-token>
Content-Type: application/json

{"requestId":"unique-command-id","recipientId":"bob","title":"Update","body":"Your report is ready"}
```

The controller demonstrates `getIo()` after initialization. HTTP success is 200
for both original requests and idempotent retries.

## Event contract

| Client command | Input | Server push / ack data |
| --- | --- | --- |
| `chat:send` | `{requestId, recipientId, body}` | `chat:message` / saved message |
| `chat:list` | `{before?, limit?}` | ack: message array |
| `notification:create` | `{requestId, recipientId, title, body}` | `notification:new` / saved notification; notifier role required |
| `notification:list` | `{before?, limit?}` | ack: notification array |
| `notification:read` | `{id}` | `notification:updated` / saved notification |
| `status:get` | `{userId}` | ack: `{userId, online}` |
| `status:watch` | `{userId}` | ack: current status, then `status:changed` pushes |
| `status:unwatch` | `{userId}` | ack: `{userId}` |

`session:ready` means domain handlers are installed. Register listeners before
connecting. Only the root React component owns the connection; children remove
their own named listeners with `off(event, handler)` and do not disconnect the
shared socket. The example uses named cleanup compatible with React StrictMode.

Each user may subscribe to up to 50 presence targets per socket. Presence means
an authenticated socket is connected, not that a person is actively reading.
A network failure can remain online until Socket.IO detects the lost heartbeat.
One tab closing does not mark the user offline if another tab remains connected.

## Retry and reconnect semantics

Reuse a requestId after a timeout. A unique MongoDB index on
`{tenantId, senderId, requestId}` makes concurrent retries of each command type
return the same record. Reusing a key for different content produces
`IDEMPOTENCY_CONFLICT`. Indexes are installed before listening; manage these
indexes in deployment migrations for a large existing database.

A retry can broadcast the same record again. Clients deduplicate records by `_id`.
The demo keeps a pending payload in memory for manual retry. Refreshing the page
loses pending commands; persist a client-side command queue if required. Discarding
a pending retry does not undo a write that already succeeded.

Recovery retains rooms and packets for up to two minutes within this process.
Recovery is best effort. On every ready session, the demo fetches the latest 50
messages and notifications and merges them with concurrent pushes. Fetch older
pages with `before` set to the last `_id` returned and `limit` up to 100. Lists
use descending ObjectId order, a stable browsing order rather than a strict global
commit sequence. The demo is a recent-history view, not an exhaustive replay of
all missed events. A production inbox should expose pagination in its UI.

A process may crash after saving but before broadcasting. Records remain available
through list commands, including after a restart, but this implementation has no
automatic durable push retry. If every saved event must eventually be pushed, use
a transactional outbox: persist the record and outbox entry atomically, then have
a worker claim pending entries, emit, and mark them processed. Retry after crashes
and deduplicate on clients. Do not advertise exactly-once network delivery.
For strict event replay, use a durable ordered event log and per-client offsets;
do not treat ObjectId ordering as a universal commit cursor.

## Scaling and operations

This implementation targets one Node process, including one worker (no cluster
mode). Its map tracks socket IDs per tenant/user; a Set prevents a single tab's
disconnect from erasing other devices. Recovery and presence disappear on restart.

Before adding application replicas:

- Add the Socket.IO Redis Streams adapter if retaining connection recovery. The
  classic Redis Pub/Sub adapter does not support that recovery feature.
- Replace local presence with distributed, per-node socket counts or expiring
  Redis leases plus heartbeats. A plain Redis Set without expiry leaks presence
  after a process crashes. Broadcast only distributed first-online/last-offline
  transitions; replacing the adapter alone does not fix this local map.
- Enable sticky sessions at the load balancer when using HTTP long-polling, or
  deliberately require WebSocket-only transports and assess the fallback tradeoff.
- Enforce global/user HTTP and socket connection limits at the gateway. The local
  event limiter allows 100 events per 10 seconds and 8 pending operations per
  socket; opening more sockets bypasses a per-socket limit.
- Add centralized structured logs, request IDs, DB/ack latency and failure metrics,
  and alerts. Configure replica-set durability/write concern and backups to your
  persistence SLA. Use an outbox for durable push requirements.

SIGINT/SIGTERM stop Socket.IO and close MongoDB with a ten-second shutdown deadline.
Readiness checks MongoDB connectivity. Deployments requiring graceful completion
of every in-flight write should drain traffic and track pending operations before
closing the database. This is an explicit deployment extension.

## Verification

```sh
cd production-example/server
npm test
# Optional: exercise persistence against a disposable MongoDB database:
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/realtime_test npm test
```

The socket suite uses actual HTTP and Socket.IO clients with an injected service
to verify authentication, save-before-emit ordering, rooms, tenant isolation,
validation, database error handling, and multi-tab presence. The MongoDB suite
requires TEST_MONGODB_URI and checks concurrent idempotency, conflicts, recipient
membership, notifier permission, read ownership and stable read timestamps. It
cleans only a unique test tenant's documents. A skipped MongoDB suite is not a
verified persistence integration.

```sh
cd production-example/client
npm run build
```

## Primary documentation

- [Connection state recovery](https://socket.io/docs/v4/connection-state-recovery/)
- [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [Authentication middleware](https://socket.io/docs/v4/middlewares/)
- [Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/)
- [Multiple Socket.IO nodes](https://socket.io/docs/v4/using-multiple-nodes/)
