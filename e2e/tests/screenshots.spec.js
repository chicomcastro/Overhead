// Captura evidências visuais do jogo (desktop e mobile) em momentos-chave.
// As imagens vão para reports/screenshots/ e são anexadas ao relatório.
import { test } from "@playwright/test";
import path from "path";
import { boot, api, step, ensureReports } from "./helpers.js";

async function shot(page, testInfo, name) {
  const dir = ensureReports("screenshots");
  const file = path.join(dir, `${testInfo.project.name}-${name}.png`);
  // dá um respiro para o rAF desenhar o estado atual
  await page.waitForTimeout(120);
  await page.screenshot({ path: file });
  await testInfo.attach(`${name}.png`, { path: file, contentType: "image/png" });
}

test("evidências visuais da partida", async ({ page }, testInfo) => {
  // 1) Menu inicial
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await shot(page, testInfo, "01-menu");

  // 2) Campo com torres construídas
  await page.evaluate(() => window.__OVERHEAD.reset());
  await page.evaluate(() => window.__OVERHEAD.setSpeed(0));
  for (const [t, n] of [["soul", 0], ["frost", 3], ["doom", 4], ["blast", 5]]) {
    await api(page, "build", t, n);
  }
  await shot(page, testInfo, "02-torres-construidas");

  // 3) Combate no meio da onda
  await api(page, "startWave");
  await step(page, 5);
  await shot(page, testInfo, "03-combate");

  // 4) Mais adiante, com efeitos visíveis
  await step(page, 6);
  await shot(page, testInfo, "04-combate-tardio");

  // 5) Fim de jogo (deixa vazar sem torres)
  await page.evaluate(() => window.__OVERHEAD.reset());
  await page.evaluate(() => window.__OVERHEAD.setSpeed(0));
  for (let i = 0; i < 240; i++) {
    await api(page, "startWave").catch(() => {});
    await step(page, 1);
    const s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    if (s.gameOver) break;
  }
  await shot(page, testInfo, "05-game-over");
});
