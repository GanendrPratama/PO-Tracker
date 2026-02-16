import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GoogleAuthProvider } from './contexts/GoogleAuthContext';
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GoogleAuthProvider>
      <App />
    </GoogleAuthProvider>
  </React.StrictMode>,
);
