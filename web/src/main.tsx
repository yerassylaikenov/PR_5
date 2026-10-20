import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// React.StrictMode double-invokes effects in dev — the event feed is written to
// de-duplicate by `${transactionHash}-${logIndex}` so this does not create
// duplicate rows (requirement 4.2.7).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
