import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// the colours come first: the look kept from last time is read against them as the app loads (see look.ts)
import "./styles.css";
import { App } from "./App";

// iPhones only show a pressed state (:active) on pages that listen for touches, so every button would otherwise
// look dead until the finger lifts. An empty listener is enough, and passive so it never holds up a scroll.
document.addEventListener("touchstart", () => {}, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
