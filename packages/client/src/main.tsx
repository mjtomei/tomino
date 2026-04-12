import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AtmosphereProvider } from "./atmosphere/use-atmosphere";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AtmosphereProvider>
      <App />
    </AtmosphereProvider>
  </StrictMode>,
);
