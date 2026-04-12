import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AtmosphereProvider } from "./atmosphere/use-atmosphere";
import { ThemeProvider } from "./atmosphere/theme-context.js";
import { MusicProvider } from "./audio/use-music.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AtmosphereProvider>
        <MusicProvider>
          <App />
        </MusicProvider>
      </AtmosphereProvider>
    </ThemeProvider>
  </StrictMode>,
);
