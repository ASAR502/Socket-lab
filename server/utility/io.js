import { Server } from "socket.io";

let io;

const socket = {
  init: (server) => {
    io = new Server(server, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:5175",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });
    return io;
  },
  getIo: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};

export default socket;
