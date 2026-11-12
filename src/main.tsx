import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// iPhones only show a pressed state (:active) on pages that listen for touches, so every button would otherwise
// look dead until the finger lifts. An empty listener is enough, and passive so it never holds up a scroll.
document.addEventListener("touchstart", () => {}, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
