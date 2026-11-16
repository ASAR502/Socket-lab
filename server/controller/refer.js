import socket from "../utility/io.js";
import { ObjectId } from "mongodb";
import { connectDB, getCollectionRef } from "../config/db.js";

export const handleSocketEvents = async () => {
  try {
    await connectDB();
    const collection = getCollectionRef("notification");
    const employeesCollection = getCollectionRef("employees");
    const io = socket.getIo();

    const getEmployeeNameById = async (id) => {
      const employee = await employeesCollection.findOne({ emp_id: id });
      return employee ? employee.name : "Unknown";
    };
    // jksdal
    io.on("connection", (socket) => {
      console.log(`Socket connected: ${socket.id}`);
      let org_id = "";

      socket.on("Detail", async (data) => {
        if (data != null) {
          console.log(data);
          org_id = data.organisation_Id;
          console.log(org_id);
        }
        const employeeNoti = await collection
          .find({
            role: "employee",
            organisation_Id: org_id,
          })
          .toArray();
        io.emit("employee", employeeNoti);

        const counsellorNoti = await collection
          .find({
            role: "counsellor",
            organisation_Id: org_id,
          })
          .toArray();
        console.log("counsellor databse ", counsellorNoti);
        io.emit("counsellor", counsellorNoti);

        const NewData = await employeesCollection.findOne({
          roles: "hr",
          organisation_Id: org_id,
          isActive: true,
        });
        if (!NewData) {
          console.error("Document not found of hr.");
        } else {
          // console.log(NewData.messages);
          io.emit("hr", NewData.messages);
        }
      });

      socket.on("employees", async (data) => {
        try {
          console.log("Received from HR counsellor data:", data);
          const empdata = await employeesCollection.findOne({
            roles: "counsellor",
            organisation_Id: data.organisation_Id,
          });
          const desc = `You have been referred by HR (${await getEmployeeNameById(
            data.hr_id
          )}) to (${empdata?.name})`;

          const Data = { ...data, createdAt: new Date(), desc };
          await collection.insertOne(Data);
          const NewData = await collection
            .find({
              role: "employee",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          io.emit("employee", NewData);
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("counsellors", async (data) => {
        try {
          console.log("Received from HR counsellor data:", data);

          const desc = `You have a new referral from HR (${await getEmployeeNameById(
            data.hr_id
          )}) for ${await getEmployeeNameById(
            data.emp_id
          )}. Please schedule an appointment`;

          const Data = { ...data, createdAt: new Date(), desc };
          await collection.insertOne(Data);
          const NewData = await collection
            .find({
              role: "counsellor",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          io.emit("counsellor", NewData);
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("newAppointment", async (data) => {
        try {
          console.log("Received from HR counsellor data:", data);

          const desc = `Upcoming appointment with (${await getEmployeeNameById(
            data.emp_id
          )}) at ${data.slot[0]}.`;
          const Data = { ...data, createdAt: new Date(), desc };
          await collection.insertOne(Data);
          const NewData = await collection
            .find({
              role: "counsellor",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          io.emit("counsellor", NewData);
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("reschedule", async (data) => {
        try {
          console.log("Received from HR counsellor data:", data);

          const desc = `Upcoming appointment with (${await getEmployeeNameById(
            data.emp_id
          )}) at ${data.slot[0]}.`;
          const Data = { ...data, createdAt: new Date(), desc };
          await collection.insertOne(Data);
          const NewData = await collection
            .find({
              role: "counsellor",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          io.emit("counsellor", NewData);
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("message", async (data) => {
        try {
          console.log("Received from manager:", data);

          const newMessage = { ...data, createdAt: new Date() };

          const updateResult = await employeesCollection.updateOne(
            {
              organisation_Id: data.organisation_Id,
              roles: "hr",
              isActive: true,
            },
            {
              $push: { messages: newMessage },
            }
          );

          if (updateResult.modifiedCount === 0) {
            console.error("No documents were updated.");
          }

          const NewData = await employeesCollection.findOne({
            roles: "hr",
            organisation_Id: data.organisation_Id,
            isActive: true,
          });

          if (!NewData) {
            console.error("Document not found.");
          } else {
            io.emit("hr", NewData.messages);
          }
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("delete", async (data) => {
        try {
          console.log("qwerty", data);
          const deleteNot = await collection.deleteOne({
            _id: new ObjectId(data),
          });
          const counNoti = await collection
            .find({
              role: "counsellor",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          const empNoti = await collection
            .find({
              role: "employee",
              organisation_Id: data.organisation_Id,
            })
            .toArray();
          io.emit("employee", empNoti);
          io.emit("counsellor", counNoti);
          console.log(deleteNot);
        } catch (err) {
          console.log(err);
        }
      });

      socket.on("disconnect", () => {
        console.log(`Socket disconnected: ${socket.id}`);
      });
    });
  } catch (err) {
    console.error("Error while setting up socket events:", err);
  }
};
