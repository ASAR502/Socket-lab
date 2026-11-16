import http from "http";
import express from "express";
import cors from "cors";
import router from "./routes/routes.js";
import socket from "./utility/io.js";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { handleSocketEvents } from "./controller/refer.js";
dotenv.config();
// await connectDB();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);

app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  }),
);

const io = socket.init(server);
io.on("connection", (clientSocket) => {
  console.log("User connected with ID:", clientSocket.id);

  clientSocket.on("disconnect", () => {
    console.log("User disconnected:", clientSocket.id);
  });
});
// handleSocketEvents();

app.use("/api", router);

const port = 8000;
server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
