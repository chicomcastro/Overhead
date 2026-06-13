// Verifica cada mecânica central do jogo de forma determinística, usando a
// API de debug (window.__OVERHEAD) e o stepping de simulação por dt fixo.
import { test, expect } from "@playwright/test";
import { boot, snap, api, step } from "./helpers.js";

// Roda só no desktop — a lógica é a mesma nos dois layouts.
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "mecânica é independente de layout");
  await boot(page);
  await page.evaluate(() => window.__OVERHEAD.setSpeed(0)); // só nós dirigimos o tempo
});

test("estado inicial bate com a config", async ({ page }) => {
  const cfg = await api(page, "config");
  const s = await snap(page);
  expect(s.mana).toBe(cfg.initialMana);
  expect(s.lives).toBe(cfg.initialLives);
  expect(s.wave).toBe(0);
  expect(s.gameOver).toBe(false);
  expect(s.towers).toHaveLength(0);
});

test("construir torre desconta mana e ocupa o nó", async ({ page }) => {
  const before = await snap(page);
  const built = await api(page, "build", "arcane", 0);
  expect(built).toBe(true);
  const after = await snap(page);
  expect(after.towers).toEqual([{ type: "arcane", level: 1 }]);
  expect(after.mana).toBeLessThan(before.mana); // pagou o custo
  // não dá pra construir no mesmo nó de novo
  expect(await api(page, "build", "frost", 0)).toBe(false);
});

test("não constrói sem mana suficientes", async ({ page }) => {
  // gasta quase tudo: doom custa 34, sobra 6
  await api(page, "build", "doom", 0);
  const built = await api(page, "build", "doom", 1); // 34 > 6
  expect(built).toBe(false);
});

test("upgrade sobe o nível e desconta mana", async ({ page }) => {
  await api(page, "build", "arcane", 0); // custa 14, sobra 26
  const before = await snap(page);
  const ok = await api(page, "upgradeAt", 0); // upgrade ~22
  expect(ok).toBe(true);
  const after = await snap(page);
  expect(after.towers[0].level).toBe(2);
  expect(after.mana).toBeLessThan(before.mana);
});

test("vender devolve mana e libera o nó", async ({ page }) => {
  await api(page, "build", "arcane", 0);
  const mid = await snap(page);
  const ok = await api(page, "sellAt", 0);
  expect(ok).toBe(true);
  const after = await snap(page);
  expect(after.towers).toHaveLength(0);
  expect(after.mana).toBeGreaterThan(mid.mana); // recebeu reembolso
  expect(await api(page, "build", "frost", 0)).toBe(true); // nó livre de novo
});

test("iniciar onda spawna inimigos e a torre dispara e mata (mana/score sobem)", async ({ page }) => {
  // duas torres arcanas perto do caminho
  await api(page, "build", "arcane", 0);
  await api(page, "build", "arcane", 1);
  await api(page, "startWave");
  let s = await snap(page);
  expect(s.wave).toBe(1);

  // avança e exige que apareçam inimigos e projéteis
  await step(page, 3);
  s = await snap(page);
  expect(s.enemies).toBeGreaterThan(0);

  const beforeScore = s.score;
  await step(page, 12);
  s = await snap(page);
  expect(s.score).toBeGreaterThan(beforeScore); // matou algo -> pontuou
});

test("esfera gélida aplica slow nos inimigos", async ({ page }) => {
  await api(page, "build", "frost", 3);
  await api(page, "build", "frost", 4);
  await api(page, "startWave");
  let maxSlowed = 0;
  for (let i = 0; i < 40; i++) {
    await step(page, 0.5);
    const s = await snap(page);
    maxSlowed = Math.max(maxSlowed, s.slowed);
    if (s.enemies === 0 && s.queued === 0) break;
  }
  expect(maxSlowed).toBeGreaterThan(0);
});

test("esfera ígnea aplica queimadura (burn)", async ({ page }) => {
  await api(page, "build", "blast", 4);
  await api(page, "build", "blast", 5);
  await api(page, "startWave");
  let maxBurning = 0;
  for (let i = 0; i < 40; i++) {
    await step(page, 0.5);
    const s = await snap(page);
    maxBurning = Math.max(maxBurning, s.burning);
    if (s.enemies === 0 && s.queued === 0) break;
  }
  expect(maxBurning).toBeGreaterThan(0);
});

test("inimigos que vazam reduzem as vidas da Torre Mestra", async ({ page }) => {
  // sem torres: a onda inteira vaza
  await api(page, "startWave");
  const before = await snap(page);
  for (let i = 0; i < 120; i++) {
    await step(page, 0.5);
    const s = await snap(page);
    if (s.lives < before.lives) break;
  }
  const after = await snap(page);
  expect(after.lives).toBeLessThan(before.lives);
});

test("ondas progridem após limpar a onda", async ({ page }) => {
  // muitas torres fortes pra limpar rápido
  for (const n of [0, 1, 3, 4, 5]) await api(page, "build", "doom", n);
  await api(page, "startWave");
  // roda até a onda terminar e o intervalo zerar -> próxima onda
  let reachedWave2 = false;
  for (let i = 0; i < 400; i++) {
    await step(page, 0.25);
    const s = await snap(page);
    if (s.wave >= 2) { reachedWave2 = true; break; }
  }
  expect(reachedWave2).toBe(true);
});
