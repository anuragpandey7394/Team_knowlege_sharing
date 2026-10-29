import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Team Knowledge Assistant</h1>
      <p>Foundation bootstrap. Application features are under construction.</p>
      <p>AI not connected.</p>
    </main>
  </StrictMode>,
);
