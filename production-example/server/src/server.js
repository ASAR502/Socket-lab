import { createServer } from "node:http";
import mongoose from "mongoose";
import { config } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { createAuthenticator } from "./middleware/auth.js";
import { createRealtimeService } from "./services/realtimeService.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket/socket.js";

try {
  await connectDB(config.mongoUri);
  const dependencies = { origins: config.origins, authenticate: createAuthenticator(config.jwt), service: createRealtimeService() };
  const server = createServer(createApp(dependencies));
  const io = initSocket(server, dependencies);
  server.listen(config.port, () => console.info(`Realtime server listening on ${config.port}`));
  server.on("error", (error) => { console.error(error); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    io.close(() => {
      mongoose.disconnect().then(() => process.exit(0), () => process.exit(1));
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} catch (error) {
  console.error("Startup failed", error);
  await mongoose.disconnect();
  process.exitCode = 1;
}
