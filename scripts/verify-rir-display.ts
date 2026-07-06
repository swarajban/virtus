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
 * 3. Powerbuilding exercise (Back squat, 1x5 @ 80% RPE 7.5): prescription
 *    line unchanged, no RIR chips.
 *
 * Usage: tsx scripts/verify-rir-display.ts   (dev server on :5000)
 */
import { webkit, BrowserContext } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5000';
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function makeContext(browser: any, username: string, program: string): Promise<BrowserContext> {
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
  const browser = await webkit.launch();

  // --- 1. Min-Max exercise with an RIR of 0 (Pec Deck: 2x6, set1=1, set2=0)
  {
    const ctx = await makeContext(browser, 'minmax-test', 'Min-Max 5x');
    const page = await ctx.newPage();
    await page.goto(`${BASE}/workout/1/exercise/1`);
    await page.getByRole('heading', { level: 2, name: 'Pec Deck' }).waitFor({ timeout: 15000 });

    const set1 = page.getByText('Set 1: 1 RIR');
    const set2 = page.getByText('Set 2: 0 RIR');
    check('Min-Max: "Set 1: 1 RIR" chip visible', await set1.isVisible());
    check('Min-Max: "Set 2: 0 RIR" chip visible (0 not dropped)', await set2.isVisible());

    const prescription = (await page
      .locator('p', { hasText: /2 x 6/ })
      .first()
      .textContent())?.trim();
    check(
      'Min-Max: prescription is bare "2 x 6" (no empty %1RM/RPE fragments)',
      prescription === '2 x 6',
      `got ${JSON.stringify(prescription)}`,
    );
    check('Min-Max: page has no "% 1RM" text', !(await page.getByText('% 1RM').isVisible().catch(() => false)));
    check('Min-Max: page has no "RPE" text', !(await page.getByText('RPE').first().isVisible().catch(() => false)));

    const infoBtn = page.getByRole('button', { name: 'What is RIR?' });
    check('Min-Max: RIR info button present', await infoBtn.isVisible());
    await infoBtn.tap();
    const hint = page.getByText('RIR = reps in reserve', { exact: false });
    check('Min-Max: RIR hint appears after tap', await hint.isVisible());
    await infoBtn.tap();
    check('Min-Max: RIR hint toggles off on second tap', !(await hint.isVisible()));

    await page.screenshot({ path: '/tmp/rir-minmax-pecdeck.png' });
    await ctx.close();
  }

  // --- 2. Min-Max single-set exercise (Smith Machine Lunge: 1 set, set1=1, set2=N/A)
  {
    const ctx = await makeContext(browser, 'minmax-test', 'Min-Max 5x');
    const page = await ctx.newPage();
    await page.goto(`${BASE}/workout/2/exercise/2`);
    await page.getByRole('heading', { level: 2, name: 'Smith Machine Lunge' }).waitFor({ timeout: 15000 });
    check('Min-Max 1-set: "Set 1: 1 RIR" visible', await page.getByText('Set 1: 1 RIR').isVisible());
    check('Min-Max 1-set: no "Set 2" chip', !(await page.getByText(/^Set 2:/).isVisible().catch(() => false)));
    await page.screenshot({ path: '/tmp/rir-minmax-lunge.png' });
    await ctx.close();
  }

  // --- 3. Powerbuilding regression (Back squat working: 1 x 5 @ 80% 1RM, RPE 7.5)
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
    check('Powerbuilding: no RIR chips', !(await page.getByText('RIR').first().isVisible().catch(() => false)));
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
