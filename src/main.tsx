import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GoogleAuthProvider } from './contexts/GoogleAuthContext';
import { ProductsProvider } from './contexts/ProductsContext';
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GoogleAuthProvider>
      <ProductsProvider>
        <App />
      </ProductsProvider>
    </GoogleAuthProvider>
  </React.StrictMode>,
);
