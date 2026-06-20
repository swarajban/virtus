/**
 * Playwright verification for the crossfade fix.
 *
 * Proves the animation NOW FIRES on every Next/Prev within exercise.tsx:
 * - The motion.div is keyed by exerciseIndex, so it remounts on every nav
 * - Detects the opacity transition (0 → 1) firing on each Next/Prev
 * - Confirms progress persists and no console errors
 */
import { chromium, Page } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.DEMO_BASE_URL || "http://localhost:5000";
const ART_DIR = join(process.cwd(), "demo-artifacts", "crossfade");
mkdirSync(ART_DIR, { recursive: true });

let step = 0;
const log = (m: string) => console.log(`[test] ${m}`);
async function shot(page: Page, name: string) {
  step += 1;
  const file = join(ART_DIR, `${String(step).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  log(`screenshot -> ${file}`);
  return file;
}

(async () => {
  log(`launching headless chromium against ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("Failed to fetch OneRM")) {
      log(`  [browser:error] ${t.slice(0, 140)}`);
      consoleErrors.push(t);
    }
  });

  try {
    log("=== home → workout → exercise ===");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    await shot(page, "home");

    await page.click('button:has-text("Next Workout")');
    await page.waitForFunction(() => /\/workout\/\d+$/.test(window.location.pathname), undefined, { timeout: 5000 });
    await page.waitForTimeout(600);
    await shot(page, "workout");

    await page.waitForSelector('h4.font-semibold', { timeout: 5000 });
    await page.locator('h4.font-semibold').first().click();
    await page.waitForFunction(() => /\/exercise\/\d+$/.test(window.location.pathname), undefined, { timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(page, "exercise-initial");

    const initialUrl = page.url();
    const initialIdx = initialUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";
    log(`initial exercise index: ${initialIdx}`);

    // The proof: tap Next and detect that the motion.div remounts (by checking
    // that a fresh opacity animation starts). We'll poll the computed opacity
    // right after the click and verify it starts near 0 (the initial keyframe).
    log("=== tapping Next and detecting crossfade ===");
    const before = page.url();
    await page.click('button:has-text("Next")');

    // Wait for URL to change (the nav completes)
    await page.waitForFunction((prev) => window.location.href !== prev, before, { timeout: 3000 });
    const afterUrl = page.url();
    const afterIdx = afterUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";
    log(`navigated: ${initialIdx} → ${afterIdx}`);

    // Immediately after nav, the keyed motion.div should have just mounted and
    // started its opacity 0→1 animation. Sample the computed opacity within the
    // first few frames (should be <0.5 if the 150ms fade is running).
    await page.waitForTimeout(30); // early in the 150ms window
    const opacityDuringFade = await page.evaluate(() => {
      const root = document.querySelector('.max-w-md.mx-auto.bg-white.min-h-screen.relative');
      if (!root) return null;
      return parseFloat(window.getComputedStyle(root).opacity);
    });
    log(`opacity sampled 30ms after Next click: ${opacityDuringFade}`);

    await page.waitForTimeout(200); // let the fade complete
    await shot(page, "after-next");

    const fadeDetected = opacityDuringFade !== null && opacityDuringFade < 0.95;
    log(fadeDetected ? "✅ crossfade animation detected (opacity < 0.95 during transition)" : `❌ no fade detected (opacity=${opacityDuringFade})`);

    // Tap Previous and verify the fade fires again
    log("=== tapping Previous and detecting crossfade ===");
    const beforePrev = page.url();
    await page.click('button:has-text("Previous")');
    await page.waitForFunction((prev) => window.location.href !== prev, beforePrev, { timeout: 3000 });
    await page.waitForTimeout(30);
    const opacityDuringPrevFade = await page.evaluate(() => {
      const root = document.querySelector('.max-w-md.mx-auto.bg-white.min-h-screen.relative');
      if (!root) return null;
      return parseFloat(window.getComputedStyle(root).opacity);
    });
    log(`opacity sampled 30ms after Previous click: ${opacityDuringPrevFade}`);
    await page.waitForTimeout(200);
    await shot(page, "after-prev");

    const prevFadeDetected = opacityDuringPrevFade !== null && opacityDuringPrevFade < 0.95;
    log(prevFadeDetected ? "✅ crossfade on Previous detected" : `❌ no fade on Prev (opacity=${opacityDuringPrevFade})`);

    // Completion persistence check
    log("=== complete + verify persistence ===");
    await page.waitForTimeout(400);
    const completedUrl = page.url();
    const completedIdx = completedUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";
    const weightInput = await page.$('input[type="number"]');
    if (weightInput) await weightInput.fill("225");
    await page.click('button:has-text("Complete")');
    await page.waitForTimeout(500); // reward + auto-advance
    await shot(page, "after-complete");

    // Navigate back in-app and confirm badge persists
    await page.click('button:has-text("Previous")').catch(() => {});
    await page.waitForTimeout(800);
    const backUrl = page.url();
    const backIdx = backUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";
    const completedBadge = await page.$('text=/Completed/i');
    const persisted = backIdx === completedIdx && !!completedBadge;
    log(persisted ? "✅ completion persisted" : `❌ completion NOT persisted (idx=${backIdx}, badge=${!!completedBadge})`);
    await shot(page, "verify-persisted");

    // RESULTS
    log("========================================");
    log("RESULTS");
    log(`- crossfade detected on Next: ${fadeDetected}`);
    log(`- crossfade detected on Previous: ${prevFadeDetected}`);
    log(`- progress persisted: ${persisted}`);
    log(`- console errors: ${consoleErrors.length}`);

    let ok = true;
    if (!fadeDetected) { log("❌ Next animation did NOT fire"); ok = false; }
    if (!prevFadeDetected) { log("❌ Previous animation did NOT fire"); ok = false; }
    if (!persisted) { log("❌ progress not persisted"); ok = false; }
    if (consoleErrors.length > 0) { log(`❌ ${consoleErrors.length} console errors`); ok = false; }

    if (ok) log("✅ ALL CHECKS PASSED — crossfade fires on every Next/Prev");
    else { log("❌ CHECKS FAILED"); process.exitCode = 1; }
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.stack : String(err)}`);
    await shot(page, "error-state").catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    log("browser closed");
  }
})();
