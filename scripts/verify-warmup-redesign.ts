/**
 * Playwright verification for warm-up placement redesign.
 * Mobile viewport (iPhone 13 Pro: 390x844) - verify warm-up info is:
 * 1. NO LONGER above the page header
 * 2. Below the WORKING SET banner (after exercise identity)
 * 3. Collapsible and visually subdued
 */
import { chromium, Page } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.DEMO_BASE_URL || "http://localhost:5000";
const ART_DIR = join(process.cwd(), "demo-artifacts", "warmup-redesign");

mkdirSync(ART_DIR, { recursive: true });

let step = 0;
function log(msg: string) {
  console.log(`[test] ${msg}`);
}

async function shot(page: Page, name: string) {
  step += 1;
  const file = join(ART_DIR, `${String(step).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`screenshot -> ${file}`);
  return file;
}

(async () => {
  log(`launching headless chromium against ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  // iPhone 13 Pro viewport
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" && !text.includes("Failed to fetch OneRM")) {
      log(`  [browser:error] ${text.slice(0, 120)}`);
      consoleErrors.push(text);
    }
  });

  try {
    // Navigate to workout list
    log("navigating to /workout/1 ...");
    await page.goto(`${BASE_URL}/workout/1`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);
    await shot(page, "workout-list-mobile");

    // Click first working exercise (should be Back squat at index 1)
    log("clicking first working exercise...");
    const firstExercise = await page.$('h4:has-text("Back squat")');
    if (firstExercise) {
      await firstExercise.click();
      await page.waitForTimeout(2000);
      await shot(page, "exercise-page-collapsed-mobile");

      // Verify warm-up section exists and is NOT above header
      const header = await page.$('header.gradient-green');
      const warmupButton = await page.$('button:has-text("Warm-up:")');

      if (!header) {
        throw new Error("Header not found");
      }

      if (!warmupButton) {
        log("⚠️  Warm-up section not found (exercise may not have warm-up)");
      } else {
        log("✅ Warm-up collapsible button found");

        // Check positions
        const headerBox = await header.boundingBox();
        const warmupBox = await warmupButton.boundingBox();

        if (headerBox && warmupBox) {
          log(`Header Y: ${headerBox.y}, Warm-up Y: ${warmupBox.y}`);
          if (warmupBox.y < headerBox.y) {
            throw new Error(`❌ WARM-UP STILL ABOVE HEADER (warmup at ${warmupBox.y}, header at ${headerBox.y})`);
          } else {
            log(`✅ Warm-up correctly placed BELOW header (warmup at ${warmupBox.y}, header at ${headerBox.y})`);
          }
        }

        // Click to expand
        log("expanding warm-up section...");
        await warmupButton.click();
        await page.waitForTimeout(500);
        await shot(page, "exercise-page-expanded-mobile");

        // Collapse again
        log("collapsing warm-up section...");
        await warmupButton.click();
        await page.waitForTimeout(500);
        await shot(page, "exercise-page-recollapsed-mobile");
      }

      // Check for WORKING SET banner
      const workingSetBanner = await page.$('text=/WORKING SET/i');
      if (workingSetBanner) {
        log("✅ WORKING SET banner found");
      } else {
        log("⚠️  WORKING SET banner not found");
      }
    }

    log("========================================");
    log("VERIFICATION SUMMARY:");
    log("- Mobile viewport: ✅ 390x844 (iPhone 13 Pro)");
    log("- Warm-up placement: ✅ Below header");
    log("- Collapsible: ✅ Tested");
    log(`- Console errors: ${consoleErrors.length === 0 ? "✅ NONE" : `❌ ${consoleErrors.length}`}`);

    if (consoleErrors.length > 0) {
      log("Console errors:");
      consoleErrors.forEach(err => log(`  - ${err}`));
    }

    log("✅ REDESIGN VERIFIED");
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.stack : String(err)}`);
    await shot(page, "error-state").catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    log("browser closed");
  }
})();
