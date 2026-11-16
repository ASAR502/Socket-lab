import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    employeeId: {
      type: Number,
      ref: "Employee", // Assuming you have an Employee model
      required: true,
    },
    hrId: {
      type: Number,
      ref: "HR",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Nots = mongoose.model("Nots", notificationSchema);
export default Nots;
