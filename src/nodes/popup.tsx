import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "../frontend/popup/Popup";
import "../frontend/styles/popup.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
