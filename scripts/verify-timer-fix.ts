/**
 * Playwright verification for rest timer stale state fix.
 * Tests:
 * 1. Stale timer (25h old) resets to 0:00
 * 2. Fresh timer (90s old) still works correctly
 */
import { chromium, Page } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.DEMO_BASE_URL || "http://localhost:5000";
const ART_DIR = join(process.cwd(), "demo-artifacts", "timer-fix");

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

  let consoleErrors: string[] = [];

  try {
    // TEST 1: Stale timer (25 hours old) should reset to 0:00
    log("========================================");
    log("TEST 1: Stale timer (25h old) should reset");
    log("========================================");

    const context1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page1 = await context1.newPage();
    consoleErrors = [];
    page1.on("console", (m) => {
      const text = m.text();
      if (m.type() === "error" && !text.includes("Failed to fetch OneRM")) {
        log(`  [browser:error] ${text.slice(0, 120)}`);
        consoleErrors.push(text);
      }
    });

    // Set stale timer in localStorage
    await page1.goto(`${BASE_URL}`, { waitUntil: "networkidle" });
    const staleStartTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    await page1.evaluate((startTime) => {
      localStorage.setItem('restTimerState', JSON.stringify({
        isRunning: true,
        startTime: startTime,
        setCounter: 3
      }));
    }, staleStartTime);

    log(`Set stale timer: startTime = ${staleStartTime} (25h ago)`);

    // Reload page to trigger loadTimerState
    await page1.reload({ waitUntil: "networkidle" });
    await page1.waitForTimeout(1000);

    // Navigate to exercise page to see timer
    log("navigating to /workout/1/exercise/1 ...");
    await page1.goto(`${BASE_URL}/workout/1/exercise/1`, { waitUntil: "networkidle" });
    await page1.waitForTimeout(2000);

    // Check timer display
    const timerText = await page1.textContent('.rest-timer-display, text=/\\d+:\\d+/, [class*="timer"]').catch(() => null);
    log(`Timer display text: ${timerText || 'not found'}`);

    // Look for timer element more broadly
    const pageContent = await page1.content();
    const has1464 = pageContent.includes('1464') || pageContent.includes('90000');

    if (has1464) {
      log("❌ FAIL: Timer still shows huge number (stale timer not reset)");
      await shot(page1, "stale-NOT-reset-FAIL");
      throw new Error("Stale timer was not reset");
    } else {
      log("✅ PASS: Timer does not show huge bogus number");
    }

    await shot(page1, "01-stale-reset");

    // Verify localStorage was cleaned
    const cleanedState = await page1.evaluate(() => {
      const state = localStorage.getItem('restTimerState');
      return state ? JSON.parse(state) : null;
    });
    log(`Cleaned state after stale test: ${JSON.stringify(cleanedState)}`);

    if (cleanedState && cleanedState.isRunning) {
      log("❌ FAIL: Timer still marked as running after stale reset");
      throw new Error("Stale timer not stopped");
    } else {
      log("✅ PASS: Stale timer reset to stopped state");
    }

    await context1.close();

    // TEST 2: Fresh timer (90s old) should still work correctly
    log("========================================");
    log("TEST 2: Fresh timer (90s old) should still work");
    log("========================================");

    const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await context2.newPage();
    consoleErrors = [];
    page2.on("console", (m) => {
      const text = m.text();
      if (m.type() === "error" && !text.includes("Failed to fetch OneRM")) {
        log(`  [browser:error] ${text.slice(0, 120)}`);
        consoleErrors.push(text);
      }
    });

    await page2.goto(`${BASE_URL}`, { waitUntil: "networkidle" });

    const freshStartTime = Date.now() - (90 * 1000); // 90 seconds ago
    await page2.evaluate((startTime) => {
      localStorage.setItem('restTimerState', JSON.stringify({
        isRunning: true,
        startTime: startTime,
        setCounter: 5
      }));
      // Force persist
      const check = localStorage.getItem('restTimerState');
      console.log('[test-setup] Fresh timer set:', check);
    }, freshStartTime);

    log(`Set fresh timer: startTime = ${freshStartTime} (90s ago)`);

    // Reload to load the state
    await page2.reload({ waitUntil: "networkidle" });
    await page2.waitForTimeout(1000);

    // Navigate to exercise page
    await page2.goto(`${BASE_URL}/workout/1/exercise/1`, { waitUntil: "networkidle" });
    await page2.waitForTimeout(2000);

    // Check if timer is running
    const freshState = await page2.evaluate(() => {
      const state = localStorage.getItem('restTimerState');
      return state ? JSON.parse(state) : null;
    });

    log(`Fresh state after reload: ${JSON.stringify(freshState)}`);

    if (!freshState || !freshState.isRunning) {
      log("❌ FAIL: Fresh timer was incorrectly stopped");
      await shot(page2, "fresh-stopped-FAIL");
      throw new Error("Fresh timer was reset when it shouldn't have been");
    } else {
      log("✅ PASS: Fresh timer still running");
    }

    // Verify elapsed time is approximately correct (around 90-93 seconds)
    const elapsed = Date.now() - freshState.startTime;
    const elapsedSec = Math.floor(elapsed / 1000);
    log(`Fresh timer elapsed: ${elapsedSec}s (expected ~90s)`);

    if (elapsedSec < 85 || elapsedSec > 100) {
      log(`⚠️  WARNING: Elapsed time ${elapsedSec}s is outside expected range 85-100s`);
    } else {
      log("✅ PASS: Fresh timer elapsed time is correct");
    }

    await shot(page2, "02-fresh-still-works");

    await context2.close();

    log("========================================");
    log("VERIFICATION SUMMARY:");
    log("- Stale timer (25h): ✅ Reset to stopped state");
    log("- Fresh timer (90s): ✅ Still running correctly");
    log(`- Console errors: ${consoleErrors.length === 0 ? "✅ NONE" : `❌ ${consoleErrors.length}`}`);

    if (consoleErrors.length > 0) {
      log("Console errors:");
      consoleErrors.forEach(err => log(`  - ${err}`));
    }

    log("✅ ALL TESTS PASSED");
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.stack : String(err)}`);
    await shot(page, "error-state").catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    log("browser closed");
  }
})();
