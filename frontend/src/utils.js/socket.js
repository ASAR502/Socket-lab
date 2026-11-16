// src/socket.js
import { io } from "socket.io-client";

const URL = "http://localhost:8000";

export const socket = io(URL, {
  withCredentials: true,
  autoConnect: false, // Prevents connecting before your app is ready
});
