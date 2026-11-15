import mongoose from "mongoose";
import { Message, Notification, User } from "../models/index.js";

export async function connectDB(uri) {
  mongoose.set("bufferCommands", false);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    autoIndex: false,
  });
  // Deploy these indexes as a migration at large scale. Writes start only after
  // the unique indexes exist; otherwise concurrent retries could create duplicates.
  await Promise.all([Message.createIndexes(), Notification.createIndexes(), User.createIndexes()]);
}
