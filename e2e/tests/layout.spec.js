// "Regressão visual" determinística: em vez de comparar pixels (frágil entre
// ambientes), valida a ESTRUTURA do layout em cada estado — elementos certos
// visíveis/escondidos, sem overflow horizontal no mobile, controles dentro da
// viewport. Pega a classe de bug que importa (layout quebrado, item cortado)
// sem flakiness de fonte/antialiasing. Roda em desktop e mobile.
import { test, expect } from "@playwright/test";
import { boot } from "./helpers.js";

async function gotoFresh(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
}

// Inicia a partida pelo botão do menu e fecha o coach de 1ª jogada, se surgir.
async function startGame(page) {
  await page.locator("#overlay-btn").click();
  if (await page.evaluate(() => window.__OVERHEAD.coachVisible())) {
    await page.locator("#coach-ok").click();
  }
}

// Overflow horizontal do documento (px). <= 1 significa "sem barra lateral".
function hOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// boundingBox precisa caber dentro da viewport (com pequena tolerância).
async function expectInViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const vp = page.viewportSize();
  expect(box, `${selector} sem boundingBox`).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
}

test("menu: controles essenciais presentes e visíveis", async ({ page }) => {
  await gotoFresh(page);
  await expect(page.locator("#overlay")).toBeVisible();
  await expect(page.locator("#overlay-btn")).toBeVisible();    // Jogar (campanha)
  await expectInViewport(page, "#overlay-btn");                // botão Jogar acessível
  await expect(page.locator("#free-btn")).toBeVisible();       // Modo Livre
  await expect(page.locator("#options-btn")).toBeVisible();    // acesso às opções
  await expect(page.locator("#options-sheet")).not.toHaveClass(/show/); // sheet fechado
  await expect(page.locator("#save-row")).toBeHidden();        // só aparece ao pontuar

  // abrir Modo Livre (bottom sheet) revela dificuldade/mapa/modo infinito
  await page.locator("#free-btn").click();
  await expect(page.locator("#free-sheet")).toHaveClass(/show/);
  await expect(page.locator("#difficulty-modes .seg-btn")).toHaveCount(3);
  await expect(page.locator("#map-modes .seg-btn")).toHaveCount(
    await page.evaluate(() => window.__OVERHEAD.mapCount()));
  await expect(page.locator("#endless-check")).toBeVisible();
});

test("menu: sem overflow horizontal", async ({ page }) => {
  await gotoFresh(page);
  expect(await hOverflow(page)).toBeLessThanOrEqual(1);
});

test("em jogo: loja, melhorias globais e HUD presentes", async ({ page }) => {
  await boot(page);            // reset, sem overlay
  await expect(page.locator(".tower-card")).toHaveCount(4);    // 4 esferas
  await expect(page.locator(".global-btn")).toHaveCount(2);    // ralo de mana
  for (const id of ["mana", "lives", "wave", "score"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  await expect(page.locator("#start-btn")).toBeVisible();
  await expectInViewport(page, "#start-btn");                  // iniciar onda acessível
});

test("em jogo: sem overflow horizontal", async ({ page }) => {
  await boot(page);
  expect(await hOverflow(page)).toBeLessThanOrEqual(1);
});

test("torre selecionada: painel com nome/nível/stats substitui as esferas", async ({ page }, ti) => {
  await boot(page);
  await page.evaluate(() => window.__OVERHEAD.addMana(500));
  const free = await page.evaluate(() => window.__OVERHEAD.freeNodes()[0]);
  await page.evaluate((n) => window.__OVERHEAD.build("arcane", n), free);
  await page.evaluate((n) => window.__OVERHEAD.selectAt(n), free);

  const panel = page.locator("#tower-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".tp-name")).not.toBeEmpty();        // qual torre
  await expect(panel.locator(".tp-level")).toContainText("Nv.");   // qual nível
  await expect(panel.locator(".tp-stats")).toContainText("dano");  // stats atuais
  await expect(page.locator("#upgrade-btn")).toBeVisible();
  await expect(page.locator("#sell-btn")).toBeVisible();

  // no mobile o painel substitui a lista de esferas (sem sobreposição)
  if (ti.project.name === "mobile") {
    await expect(page.locator("#shop-list")).toBeHidden();
    expect(await hOverflow(page)).toBeLessThanOrEqual(1);
  }

  // fechar volta para a lista de esferas
  await page.locator("#tp-close").click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".tower-card")).toHaveCount(4);
});

test("torre recém-construída já vem selecionada", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__OVERHEAD.addMana(500));
  const free = await page.evaluate(() => window.__OVERHEAD.freeNodes()[0]);
  await page.evaluate((n) => window.__OVERHEAD.build("arcane", n), free);
  // sem chamar selectAt: o painel deve aparecer sozinho com a torre construída
  await expect(page.locator("#tower-panel")).toBeVisible();
  await expect(page.locator("#tower-panel .tp-name")).toContainText("Esfera Arcana");
});

test("zoom: botões e setZoom alteram a escala e o reset enquadra", async ({ page }) => {
  await boot(page);
  const z0 = await page.evaluate(() => window.__OVERHEAD.zoomState().zoom);
  expect(z0).toBeCloseTo(1, 1);

  // botão de aproximar aumenta o zoom
  await page.locator("#zoom-in").click();
  const z1 = await page.evaluate(() => window.__OVERHEAD.zoomState().zoom);
  expect(z1).toBeGreaterThan(1);

  // não estoura a viewport mesmo ampliado
  expect(await hOverflow(page)).toBeLessThanOrEqual(1);

  // reset volta a enquadrar (zoom 1, sem pan)
  await page.locator("#zoom-reset").click();
  const zr = await page.evaluate(() => window.__OVERHEAD.zoomState());
  expect(zr.zoom).toBeCloseTo(1, 1);
  expect(zr.panX).toBe(0);

  // zoom é limitado (não passa de 3x)
  await page.evaluate(() => window.__OVERHEAD.setZoom(99));
  expect(await page.evaluate(() => window.__OVERHEAD.zoomState().zoom)).toBeLessThanOrEqual(3);
});

test("tutorial: o guia aparece na fase 1 até vencê-la, depois some", async ({ page }) => {
  await gotoFresh(page);
  await page.evaluate(() => { localStorage.removeItem("overhead_campaign_v1"); window.__OVERHEAD.resetTutorial(); });

  // 1ª jogada (fase-tutorial): o coach aparece e cabe na tela
  await page.evaluate(() => window.__OVERHEAD.startLevel(1));
  expect(await page.evaluate(() => window.__OVERHEAD.coachVisible())).toBe(true);
  await expectInViewport(page, ".coach-card");
  await page.locator("#coach-ok").click();
  expect(await page.evaluate(() => window.__OVERHEAD.coachVisible())).toBe(false);

  // ainda não venceu o tutorial: ao reentrar (mesmo após recarregar), o guia reaparece
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.evaluate(() => window.__OVERHEAD.startLevel(1));
  expect(await page.evaluate(() => window.__OVERHEAD.coachVisible())).toBe(true);
  await page.locator("#coach-ok").click();

  // vence a fase 1 → o guia não reaparece mais
  await page.evaluate(() => { window.__OVERHEAD.setScore(800); window.__OVERHEAD.endGame(true); });
  await page.evaluate(() => window.__OVERHEAD.startLevel(1));
  expect(await page.evaluate(() => window.__OVERHEAD.coachVisible())).toBe(false);
});
