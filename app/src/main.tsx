import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/table.css";
import "./styles/surfaces.css";
import "./styles/learning.css";
import "./styles/beginner.css";
import "./styles/tutorial.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker is what makes this installable and playable with the
// radio off. Registration is deliberately late and failure is non-fatal: a
// first load with no worker is still a complete game.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL },
    );
  });
}
