// Regressão do bug de mobile: tocar num nó com uma esfera selecionada precisa
// CONSTRUIR a torre. O touchstart usa preventDefault (anti-scroll), o que
// suprime o `click` sintetizado — então a ação tem de rodar no `touchend`.
import { test, expect } from "@playwright/test";
import { boot, snap } from "./helpers.js";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "fluxo específico de toque");
  await boot(page);
});

// Converte coords de mundo (do nó) para coords de tela do toque.
async function nodeScreenPos(page, nodeIndex) {
  return page.evaluate((i) => {
    const c = document.getElementById("canvas");
    const r = c.getBoundingClientRect();
    const n = window.__OVERHEAD.nodes()[i];
    return {
      x: r.left + (n.x * r.width) / c.width,
      y: r.top + (n.y * r.height) / c.height,
    };
  }, nodeIndex);
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
  expect(after.souls).toBeLessThan(before.souls);             // almas descontadas
});
