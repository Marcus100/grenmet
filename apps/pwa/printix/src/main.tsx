import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScannerRoot } from "@/app-root";
import { ServiceWorker } from "@/components/service-worker";
import "@/styles/app.css";

// The whole scanner runs in the browser; index.html holds only this root. The
// address picks the app: /organiser is the organiser screens, every other
// address is the gate scanner (ScannerRoot).
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ScannerRoot pathname={window.location.pathname} />
      <ServiceWorker />
    </StrictMode>
  );
}
