/**
 * Capture full-page screenshots of every view, in light and dark mode, into
 * screenshots/. Boots its own Vite dev server on a dedicated port so it never
 * clashes with a running `npm run dev`.
 *
 * Drives the locally installed Google Chrome through playwright-core
 * (channel: "chrome") — no browser download involved. Dark mode is emulated
 * per browser context via colorScheme, so the OS theme doesn't matter.
 *
 * Usage: npm run screenshots
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(pkgDir, "screenshots");
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

// FusionAuth's hosted login page (themed dark-mode aware via
// scripts/local-stack/kickstart.json). Served by the local-stack container;
// shots are skipped when it isn't running. client_id/redirect match the
// kickstart-provisioned poker_equity app.
const AUTH_URL =
  "http://localhost:9011/oauth2/authorize" +
  "?client_id=c37d57fd-f64d-42fc-bf27-048d658009ca" +
  "&redirect_uri=http%3A%2F%2Flocal.allin.makejohnacoffee.com%2Fauth%2Fcallback" +
  "&response_type=code";

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Dev server did not answer at ${url} within ${timeoutMs}ms`);
}

mkdirSync(outDir, { recursive: true });

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: pkgDir,
  stdio: "ignore",
});
const viteExited = new Promise((resolve) => vite.on("exit", resolve));

try {
  await waitForServer(BASE);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    async function shoot(name, colorScheme, interact, url = BASE) {
      const ctx = await browser.newContext({
        viewport: { width: 780, height: 900 },
        colorScheme,
      });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      // Freeze CSS transitions/animations so a shot taken right after an
      // interaction shows the settled state, not a mid-fade frame.
      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      if (interact) await interact(page);
      await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
      await ctx.close();
      console.log(`shot: ${name}.png`);
    }

    const runSim = async (page) => {
      await page.getByLabel(/simulations/i).fill("20000");
      await page.getByRole("button", { name: /run simulation/i }).click();
      await page.getByText(/hero equity/i).waitFor({ timeout: 15_000 });
    };
    const goSettings = async (page) => {
      await page.getByRole("link", { name: "Settings" }).click();
      await page.getByRole("heading", { name: "Settings" }).waitFor();
    };
    const goPastResults = async (page) => {
      await page.getByRole("tab", { name: /past results/i }).click();
      // Anonymous visitors land on the login hint.
      await page.getByText(/to save simulation results/i).waitFor();
    };

    const authUp = await fetch(AUTH_URL).then((r) => r.ok, () => false);
    if (!authUp) console.log("skip: auth-*.png (local-stack FusionAuth not running)");

    for (const colorScheme of ["light", "dark"]) {
      await shoot(`simulator-${colorScheme}`, colorScheme);
      await shoot(`results-${colorScheme}`, colorScheme, runSim);
      await shoot(`settings-${colorScheme}`, colorScheme, goSettings);
      await shoot(`past-anon-${colorScheme}`, colorScheme, goPastResults);
      if (authUp) await shoot(`auth-${colorScheme}`, colorScheme, undefined, AUTH_URL);
    }
  } finally {
    await browser.close();
  }
} finally {
  vite.kill();
  await viteExited;
}

console.log(`\nDone — screenshots in ${outDir}`);
