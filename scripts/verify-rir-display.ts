#!/usr/bin/env tsx
/**
 * Verifies the RIR-per-set prescription display on real WebKit (iOS engine)
 * at iPhone dimensions (390x844), authenticated via the app's x-username
 * localStorage convention.
 *
 * Checks:
 * 1. Min-Max exercise (Pec Deck, 2x6, RIR 1/0): both RIR chips render,
 *    including the meaningful RIR of 0, with no empty "@ % 1RM (RPE )"
 *    fragments; the RIR info hint toggles on tap.
 * 2. Min-Max single-set-RIR exercise (Smith Machine Lunge): only Set 1 chip.
 * 3. Min-Max workout list: per-set RIR shown on exercise rows.
 * 4. Powerbuilding exercise (Back squat, 1x5 @ 80% RPE 7.5): prescription
 *    line unchanged, no RIR anywhere.
 *
 * Prerequisites: dev server on :5000, and users 'minmax-test' (selected
 * program "Min-Max 5x") and 'demo' present in the DB the server points at.
 *
 * Usage: tsx scripts/verify-rir-display.ts
 */
import { webkit, Browser, BrowserContext } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5000';
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// The server does NOT auto-create users: getUserFromRequest 500s for unknown
// usernames and the exercise page then spins forever. Fail fast with a
// fixable message instead of a 15s locator timeout.
async function assertUserExists(username: string, expectedProgram: string) {
  const res = await fetch(`${BASE}/api/user/current`, { headers: { 'x-username': username } });
  if (!res.ok) {
    console.error(
      `Preflight failed: user '${username}' not found on the server's DB (HTTP ${res.status}).\n` +
        `Create it first, e.g.: INSERT INTO users (username, selected_program) ` +
        `VALUES ('${username}', '${expectedProgram}');`,
    );
    process.exit(1);
  }
  const user = await res.json();
  if (user.selectedProgram !== expectedProgram) {
    console.error(
      `Preflight failed: user '${username}' has selectedProgram '${user.selectedProgram}', ` +
        `expected '${expectedProgram}' (the page's background getCurrentUser would flip the program mid-test).`,
    );
    process.exit(1);
  }
}

async function makeContext(browser: Browser, username: string, program: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(
    ([u, p]: string[]) => {
      localStorage.setItem('selected-username', u);
      localStorage.setItem('selected-program', p);
    },
    [username, program],
  );
  return ctx;
}

async function main() {
  await assertUserExists('minmax-test', 'Min-Max 5x');
  await assertUserExists('demo', 'Powerbuilding 4x');

  const browser = await webkit.launch();
  const minmaxCtx = await makeContext(browser, 'minmax-test', 'Min-Max 5x');

  // --- 1. Min-Max exercise with an RIR of 0 (Pec Deck: 2x6, set1=1, set2=0)
  {
    const page = await minmaxCtx.newPage();
    await page.goto(`${BASE}/workout/1/exercise/1`);
    await page.getByRole('heading', { level: 2, name: 'Pec Deck' }).waitFor({ timeout: 15000 });

    // Positive checks wait for visibility (isVisible() alone would race the
    // React commit); negative checks use count() — isVisible().catch(() =>
    // false) would turn a strict-mode multi-match (i.e. the regression
    // itself) into a PASS.
    await page.getByText('Set 1: 1 RIR').waitFor({ timeout: 5000 });
    check('Min-Max: "Set 1: 1 RIR" chip visible', true);
    await page.getByText('Set 2: 0 RIR').waitFor({ timeout: 5000 });
    check('Min-Max: "Set 2: 0 RIR" chip visible (0 not dropped)', true);

    const prescription = (await page
      .locator('p', { hasText: /2 x 6/ })
      .first()
      .textContent())?.trim();
    check(
      'Min-Max: prescription is bare "2 x 6" (no empty %1RM/RPE fragments)',
      prescription === '2 x 6',
      `got ${JSON.stringify(prescription)}`,
    );
    check('Min-Max: no "% 1RM" anywhere', (await page.getByText('% 1RM').count()) === 0);
    check('Min-Max: no "RPE" anywhere', (await page.getByText('RPE').count()) === 0);

    const infoBtn = page.getByRole('button', { name: 'What is RIR?' });
    check('Min-Max: RIR info button present', await infoBtn.isVisible());
    const hint = page.getByText('RIR = reps in reserve', { exact: false });
    await infoBtn.tap();
    await hint.waitFor({ state: 'visible', timeout: 5000 });
    check('Min-Max: RIR hint appears after tap', true);
    await infoBtn.tap();
    await hint.waitFor({ state: 'hidden', timeout: 5000 });
    check('Min-Max: RIR hint toggles off on second tap', true);

    await page.screenshot({ path: '/tmp/rir-minmax-pecdeck.png' });
    await page.close();
  }

  // --- 2. Min-Max single-set exercise (Smith Machine Lunge: 1 set, set1=1, set2=N/A)
  {
    const page = await minmaxCtx.newPage();
    await page.goto(`${BASE}/workout/2/exercise/2`);
    await page.getByRole('heading', { level: 2, name: 'Smith Machine Lunge' }).waitFor({ timeout: 15000 });
    await page.getByText('Set 1: 1 RIR').waitFor({ timeout: 5000 });
    check('Min-Max 1-set: "Set 1: 1 RIR" visible', true);
    check('Min-Max 1-set: no "Set 2" chip', (await page.getByText(/^Set 2:/).count()) === 0);
    await page.screenshot({ path: '/tmp/rir-minmax-lunge.png' });
    await page.close();
  }

  // --- 3. Min-Max workout list shows per-set RIR on exercise rows
  {
    const page = await minmaxCtx.newPage();
    await page.goto(`${BASE}/workout/1`);
    await page.getByText('Pec Deck').first().waitFor({ timeout: 15000 });
    check('Min-Max list: per-set RIR on rows', (await page.getByText('S1: 1 RIR').count()) > 0);
    check('Min-Max list: RIR 0 rendered on rows', (await page.getByText('S2: 0 RIR').count()) > 0);
    await page.screenshot({ path: '/tmp/rir-minmax-workoutlist.png' });
    await page.close();
  }
  await minmaxCtx.close();

  // --- 4. Powerbuilding regression (Back squat working: 1 x 5 @ 80% 1RM, RPE 7.5)
  {
    const ctx = await makeContext(browser, 'demo', 'Powerbuilding 4x');
    const page = await ctx.newPage();
    await page.goto(`${BASE}/workout/1/exercise/1`);
    await page.getByRole('heading', { level: 2, name: 'Back squat' }).waitFor({ timeout: 15000 });
    const prescription = (await page
      .locator('p', { hasText: /1 x 5/ })
      .first()
      .textContent())?.trim();
    check(
      'Powerbuilding: prescription line unchanged',
      prescription === '1 x 5 @ 80% 1RM (RPE 7.5)',
      `got ${JSON.stringify(prescription)}`,
    );
    check('Powerbuilding: no RIR text anywhere', (await page.getByText('RIR').count()) === 0);
    await page.screenshot({ path: '/tmp/rir-powerbuilding-squat.png' });
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
