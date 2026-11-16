import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { socket } from "./utils.js/socket.js";
export const Not = () => {
  const [listenerSet, setListenerSet] = useState(false);

  useEffect(() => {
    socket.on("notification", (data) => {
      console.log("Notification received:", data.title, data.message);
    });
    socket.emit("Detail", { organisation_Id: "12345" });

    // Clean up event listeners and disconnect socket on component unmount
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  const handleApiCall = async () => {
    console.log("<<<<>>>>>");
    try {
      const response = await axios.post("http://localhost:8000/api/hell", {
        title: "kaifALi",
        desc: "hello therapy",
      });

      console.log("API Response:", response.data);

      // Emitting an event after successful API call
      socket.emit("mff", {
        title: "kaifALi",
        desc: "hello therapy backend frontend",
      });

      // Set up the listener for "mfb" event only if it is not already set
      if (!listenerSet) {
        socket.on("mfb", (data) => {
          console.log(data.title + " <<<>>>" + data.desc);
        });
        setListenerSet(true);
      }
    } catch (err) {
      console.log("API Error:", err);
    }
  };

  return (
    <>
      <button onClick={handleApiCall}>Call API</button>
      <div>Hello from Notification</div>
    </>
  );
};
