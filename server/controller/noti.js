import socket from "../utility/io.js";
export const nots = (req, res) => {
  console.log(req.body);
  const io = socket.getIo();
  io.emit("notification", {
    title: req.body.title,
    message: req.body.desc,
  });
  res.send("Hello, world!");
};
