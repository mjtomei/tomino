import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AtmosphereProvider } from "./atmosphere/use-atmosphere";
import { ThemeProvider } from "./atmosphere/theme-context.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AtmosphereProvider>
        <App />
      </AtmosphereProvider>
    </ThemeProvider>
  </StrictMode>,
);
