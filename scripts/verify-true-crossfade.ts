/**
 * Playwright verification for TRUE crossfade (AnimatePresence overlap).
 *
 * Proves the old and new screens OVERLAP during the transition — no blank flash.
 * The keyed motion.div is wrapped in AnimatePresence mode="popLayout", so the
 * exiting screen fades out (opacity 1→0) while the entering screen fades in
 * (opacity 0→1) simultaneously. Both are visible mid-transition.
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
  const consoleWarnings: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("Failed to fetch OneRM")) {
      log(`  [browser:error] ${t.slice(0, 140)}`);
      consoleErrors.push(t);
    }
    if (m.type() === "warning" && t.includes("AnimatePresence")) {
      log(`  [browser:warn] ${t.slice(0, 140)}`);
      consoleWarnings.push(t);
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

    await page.waitForSelector('h4.font-semibold', { timeout: 5000 });
    await page.locator('h4.font-semibold').first().click();
    await page.waitForFunction(() => /\/exercise\/\d+$/.test(window.location.pathname), undefined, { timeout: 5000 });
    await page.waitForTimeout(1000);
    await shot(page, "exercise-initial");

    // The critical proof: tap Next and sample BOTH the outgoing and incoming
    // motion.div elements mid-transition. If AnimatePresence works, both should
    // have 0 < opacity < 1 at the same moment (overlap, not blank).
    log("=== tapping Next and detecting TRUE crossfade (overlap) ===");
    const beforeUrl = page.url();
    const beforeIdx = beforeUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";

    // Click Next and wait for URL to change
    await page.click('button:has-text("Next")');
    await page.waitForFunction((prev) => window.location.href !== prev, beforeUrl, { timeout: 3000 });
    const afterUrl = page.url();
    const afterIdx = afterUrl.match(/exercise\/(\d+)/)?.[1] ?? "?";
    log(`navigated: ${beforeIdx} → ${afterIdx}`);

    // Sample opacity of BOTH screens ~50ms into the 150ms transition.
    // With AnimatePresence popLayout, there should be TWO motion.div elements
    // briefly: one exiting (opacity 1→0), one entering (opacity 0→1).
    await page.waitForTimeout(50);
    const opacities = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('.max-w-md.mx-auto.bg-white.min-h-screen.relative'));
      return containers.map(el => ({
        opacity: parseFloat(window.getComputedStyle(el as HTMLElement).opacity),
        display: window.getComputedStyle(el as HTMLElement).display,
      }));
    });

    log(`containers mid-transition (50ms): ${opacities.length} found`);
    opacities.forEach((o, i) => log(`  [${i}] opacity=${o.opacity.toFixed(3)}, display=${o.display}`));

    await page.waitForTimeout(200); // let transition complete
    await shot(page, "after-next");

    // Assertions:
    // 1. At least 2 containers should exist mid-transition (outgoing + incoming)
    // 2. Both should have 0 < opacity < 1 (proving overlap, not blank)
    const hasOverlap = opacities.length >= 2 &&
      opacities.filter(o => o.opacity > 0 && o.opacity < 1 && o.display !== 'none').length >= 2;

    log(hasOverlap
      ? `✅ TRUE crossfade detected (${opacities.length} containers, both partially visible)`
      : `❌ no overlap (${opacities.length} containers, opacities: ${opacities.map(o => o.opacity.toFixed(2)).join(', ')})`
    );

    // Tap Previous and verify the crossfade again
    log("=== tapping Previous and detecting crossfade ===");
    const beforePrev = page.url();
    await page.click('button:has-text("Previous")');
    await page.waitForFunction((prev) => window.location.href !== prev, beforePrev, { timeout: 3000 });
    await page.waitForTimeout(50);
    const opacitiesPrev = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('.max-w-md.mx-auto.bg-white.min-h-screen.relative'));
      return containers.map(el => ({
        opacity: parseFloat(window.getComputedStyle(el as HTMLElement).opacity),
      }));
    });
    log(`containers after Previous (50ms): ${opacitiesPrev.length} found`);
    const hasPrevOverlap = opacitiesPrev.length >= 2 &&
      opacitiesPrev.filter(o => o.opacity > 0 && o.opacity < 1).length >= 2;
    log(hasPrevOverlap ? "✅ crossfade on Previous detected" : `❌ no overlap on Prev (${opacitiesPrev.length} containers)`);

    await page.waitForTimeout(200);
    await shot(page, "after-prev");

    // Complete flow: verify "Set logged" appears, then crossfade to next exercise
    log("=== complete + verify reward beat + crossfade ===");
    await page.waitForTimeout(400);
    const weightInput = await page.$('input[type="number"]');
    if (weightInput) await weightInput.fill("225");
    await page.click('button:has-text("Complete")');
    await page.waitForTimeout(200); // mid-reward (320ms total)
    await shot(page, "reward-beat");

    // Wait for the reward beat to finish and the auto-advance to trigger.
    // The setTimeout is 320ms, so navigation happens ~330ms from the Complete click.
    const beforeComplete = page.url();
    await page.waitForFunction(
      (prev) => window.location.href !== prev,
      beforeComplete,
      { timeout: 600 }
    );
    // URL just changed — sample NOW (early in the 150ms crossfade)
    await page.waitForTimeout(50);
    const opacitiesComplete = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('.max-w-md.mx-auto.bg-white.min-h-screen.relative'));
      return containers.map(el => parseFloat(window.getComputedStyle(el as HTMLElement).opacity));
    });
    log(`containers after Complete auto-advance (50ms): ${opacitiesComplete.length} found, opacities: ${opacitiesComplete.map(o => o.toFixed(2)).join(', ')}`);
    const hasCompleteOverlap = opacitiesComplete.length >= 2 &&
      opacitiesComplete.filter(o => o > 0 && o < 1).length >= 2;
    log(hasCompleteOverlap ? "✅ crossfade on Complete auto-advance" : `❌ no overlap after Complete`);

    await page.waitForTimeout(200);
    await shot(page, "after-complete");

    // Reduced-motion smoke test
    log("=== reduced-motion context ===");
    const rmContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const rmPage = await rmContext.newPage();
    await rmPage.goto(`${BASE_URL}/workout/1/exercise/1`, { waitUntil: "networkidle" });
    await rmPage.waitForTimeout(600);
    const beforeRM = rmPage.url();
    await rmPage.click('button:has-text("Next")').catch(() => {});
    await rmPage.waitForFunction((prev) => window.location.href !== prev, beforeRM, { timeout: 3000 }).catch(() => {});
    await rmPage.waitForTimeout(100);
    // In reduced motion, should be instant swap (no fade, but also no blank)
    const containersRM = await rmPage.evaluate(() => {
      return document.querySelectorAll('.max-w-md.mx-auto.bg-white.min-h-screen.relative').length;
    });
    log(`reduced-motion: ${containersRM} container(s) visible after nav (should be 1, instant swap)`);
    await rmContext.close();

    // RESULTS
    log("========================================");
    log("RESULTS");
    log(`- TRUE crossfade on Next (overlap): ${hasOverlap}`);
    log(`- TRUE crossfade on Previous (overlap): ${hasPrevOverlap}`);
    log(`- TRUE crossfade on Complete auto-advance: ${hasCompleteOverlap}`);
    log(`- console errors: ${consoleErrors.length}`);
    log(`- AnimatePresence warnings: ${consoleWarnings.length}`);

    let ok = true;
    if (!hasOverlap) { log("❌ Next did NOT overlap (blank flash)"); ok = false; }
    if (!hasPrevOverlap) { log("❌ Previous did NOT overlap"); ok = false; }
    if (!hasCompleteOverlap) { log("❌ Complete did NOT overlap"); ok = false; }
    if (consoleErrors.length > 0) { log(`❌ ${consoleErrors.length} console errors`); ok = false; }
    if (consoleWarnings.length > 0) { log(`⚠️  ${consoleWarnings.length} AnimatePresence warnings`); }

    if (ok) log("✅ ALL CHECKS PASSED — TRUE crossfade (no blank flash)");
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
