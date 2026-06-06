import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerServiceWorker } from "./registerServiceWorker";
import "./styles/theme.css";
import "./styles/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
