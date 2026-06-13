// Regressão do bug de mobile: tocar num nó com uma esfera selecionada precisa
// CONSTRUIR a torre. O touchstart usa preventDefault (anti-scroll), o que
// suprime o `click` sintetizado — então a ação tem de rodar no `touchend`.
import { test, expect } from "@playwright/test";
import { boot, snap } from "./helpers.js";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "fluxo específico de toque");
  await boot(page);
});

// Coords de tela do toque para um nó — via câmera real do jogo (zoom/pan/DPR).
async function nodeScreenPos(page, nodeIndex) {
  return page.evaluate((i) => window.__OVERHEAD.nodeClientXY(i), nodeIndex);
}

test("tocar num nó com esfera selecionada constrói a torre", async ({ page }) => {
  const before = await snap(page);

  // seleciona a esfera mais barata na loja (toque no card)
  await page.locator(".tower-card").first().tap();

  // toca num nó do mapa para construir
  const pos = await nodeScreenPos(page, 0);
  await page.touchscreen.tap(pos.x, pos.y);

  const after = await snap(page);
  expect(after.towers.length).toBe(before.towers.length + 1); // torre construída
  expect(after.mana).toBeLessThan(before.mana);             // mana descontadas
});
