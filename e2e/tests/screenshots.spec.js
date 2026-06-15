// Captura evidências visuais do jogo (desktop e mobile) em momentos-chave.
// Inclui screenshots genéricos + gameplay de cada território.
// As imagens vão para reports/screenshots/ e são anexadas ao relatório.
import { test } from "@playwright/test";
import path from "path";
import { boot, api, step, ensureReports } from "./helpers.js";

const TERRITORY_IDS = ["reino", "floresta", "vulcao", "oceano"];

async function shot(page, testInfo, name) {
  const dir = ensureReports("screenshots");
  const file = path.join(dir, `${testInfo.project.name}-${name}.png`);
  await page.waitForTimeout(120);
  await page.screenshot({ path: file });
  await testInfo.attach(`${name}.png`, { path: file, contentType: "image/png" });
}

function bootFresh(page) {
  return page.evaluate(() => {
    localStorage.setItem("overhead_prefs_v1", JSON.stringify({
      sound: false, speed: 1, endless: false, seenTutorial: true,
      difficulty: "normal", volume: 0, music: false, map: "serpent",
    }));
    const save = { _version: 2, territories: {} };
    for (const tid of ["reino", "floresta", "vulcao", "oceano"]) {
      save.territories[tid] = { levels: {} };
      for (let i = 1; i <= 10; i++) save.territories[tid].levels[i] = { best: 9999, stars: 3 };
    }
    localStorage.setItem("overhead_campaign_v2", JSON.stringify(save));
  });
}

test("evidências visuais da partida", async ({ page }, testInfo) => {
  // 1) Menu inicial
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await shot(page, testInfo, "01-menu");

  // 2) Campo com torres construídas (Reino)
  await page.evaluate(() => window.__OVERHEAD.reset());
  await page.evaluate(() => window.__OVERHEAD.setSpeed(0));
  for (const [t, n] of [["arcane", 0], ["frost", 3], ["doom", 4], ["blast", 5]]) {
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

test("evidências por território", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "territórios capturados apenas em desktop");
  test.setTimeout(120_000);

  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await bootFresh(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);

  const territories = await page.evaluate(() => window.__OVERHEAD.territories());

  for (const t of territories) {
    // inicia a fase 3 do território (já tem variedade de inimigos)
    await page.evaluate(({ tid }) => {
      const O = window.__OVERHEAD;
      O.setTerritory(tid);
      O.startLevel(3, tid);
      O.setSpeed(0);

      // constrói torres nos primeiros nós livres
      const towers = O.towerTypes();
      const free = O.freeNodes();
      for (let i = 0; i < Math.min(6, free.length); i++) {
        const tw = towers[i % towers.length];
        O.build(tw.id, free[i]);
      }
    }, { tid: t.id });

    // avança 2 ondas para ter combate visível
    await page.evaluate(() => {
      const O = window.__OVERHEAD;
      O.startWave();
      O.step(8);
    });

    await shot(page, testInfo, `territorio-${t.id}-combate`);

    // captura mapa de fases do território
    await page.evaluate(({ tid }) => {
      const O = window.__OVERHEAD;
      // volta pro menu
      document.getElementById("overlay").classList.add("show");
      document.getElementById("overlay-btn").textContent = "Jogar";
    }, { tid: t.id });
  }
});
