import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installPressFeedback } from "./lib/press";

// Instant, compositor-safe press feedback for tappable cards/rows (and opt iOS in
// to CSS :active). Buttons get feedback from pure CSS :active directly.
installPressFeedback();

createRoot(document.getElementById("root")!).render(<App />);
