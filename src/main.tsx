import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensurePersistentStorage } from "./lib/persistence";

// Request persistent storage as early as possible so the browser
// doesn't evict our IndexedDB / localStorage data after periods of
// inactivity (Chrome clears non-persisted site data after ~6-7 days).
// Fire-and-forget — no need to block rendering.
ensurePersistentStorage();

createRoot(document.getElementById("root")!).render(<App />);
