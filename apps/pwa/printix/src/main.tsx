import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GateApp } from "@/components/gate-app";
import "@/styles/app.css";

// The whole scanner runs in the browser; index.html holds only this root.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <GateApp />
    </StrictMode>
  );
}
