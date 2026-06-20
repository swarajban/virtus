import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { getNavDirection, pageVariants, pageTransition } from "@/lib/motion";

/**
 * Wraps a screen so it slides into place on mount with the app's "Racked"
 * motion. Enter-only by design: robust on tall mobile pages and scroll-safe,
 * while still conveying direction (forward → from the right, back → from the
 * left). Respects prefers-reduced-motion (instant, no travel).
 */
export function PageMotion({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  // Capture direction once at mount so it stays stable for this screen.
  const [direction] = useState(getNavDirection);

  return (
    <motion.div
      variants={pageVariants(direction, reduced)}
      initial="initial"
      animate="animate"
      transition={pageTransition(reduced)}
    >
      {children}
    </motion.div>
  );
}
