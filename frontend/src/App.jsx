// src/App.jsx
import { useEffect } from "react";
import { socket } from "../src/utils.js/socket.js";
import { Not } from "./notific.jsx";

function App() {
  useEffect(() => {
    // Establish the connection when the app launches
    socket.connect();

    const onConnect = () => {
      console.log("Global Socket Connected:", socket.id);
    };

    const onDisconnect = () => {
      console.log("Global Socket Disconnected");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Clean up only when the entire app closes
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <Not />
    </div>
  );
}

export default App;
