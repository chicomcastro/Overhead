// Testa as features de endgame/conteúdo: melhorias globais (ralo de almas),
// modo infinito e os novos inimigos (voador, curandeiro).
import { test, expect } from "@playwright/test";
import { boot } from "./helpers.js";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "lógica independente de layout");
  await boot(page);
});

test("melhorias globais funcionam como ralo de almas", async ({ page }) => {
  const r = await page.evaluate(() => {
    const O = window.__OVERHEAD;
    O.reset(); O.setSpeed(0);
    // banca almas jogando algumas ondas com torres baratas
    for (const n of [0, 1, 3, 4, 5]) O.build("soul", n);
    for (let w = 0; w < 8; w++) {
      const s = O.snapshot();
      if (s.gameOver) break;
      if (!s.running) O.startWave();
      O.step(0.5);
    }
    const cost0 = O.globalCost("dmg");
    const before = O.snapshot();
    // garante almas suficientes avançando mais, se preciso
    let guard = 0;
    while (O.snapshot().souls < cost0 && guard++ < 400) {
      const s = O.snapshot();
      if (s.gameOver) break;
      if (!s.running) O.startWave();
      O.step(0.5);
    }
    const soulsBefore = O.snapshot().souls;
    const bought = O.buyGlobal("dmg");
    const after = O.snapshot();
    const cost1 = O.globalCost("dmg");
    return { cost0, soulsBefore, bought, after, cost1 };
  });
  expect(r.bought).toBe(true);
  expect(r.after.globals.dmg).toBe(1);
  expect(r.after.souls).toBe(r.soulsBefore - r.cost0); // gastou as almas
  expect(r.cost1).toBeGreaterThan(r.cost0);            // próximo nível custa mais
});

test("modo infinito continua além da onda 20 (sem vitória)", async ({ page }) => {
  const r = await page.evaluate(() => {
    const O = window.__OVERHEAD;
    O.reset(); O.setSpeed(0); O.setEndless(true);
    O.addLives(500); // board invencível: isola o teste do mecanismo, não do balanceamento
    const mainType = "doom";
    for (const [t, n] of [["doom", 3], ["doom", 4], ["doom", 5], ["frost", 0], ["frost", 1]]) O.build(t, n);
    const nodeCount = O.nodeCount();
    // board esmagadora: constrói tudo, sobe níveis e despeja almas em
    // melhorias globais — isola o teste do balanceamento (queremos só provar
    // que passar da onda 20 não dispara vitória no modo infinito).
    const spend = () => {
      let acted = true;
      while (acted) {
        acted = false;
        const free = O.freeNodes();
        if (free.length && O.build(mainType, free[0])) { acted = true; continue; }
        let up = false;
        for (let n = 0; n < nodeCount; n++) { if (O.upgradeAt(n)) { up = true; break; } }
        if (up) { acted = true; continue; }          // maxa torres primeiro
        if (O.buyGlobal("dmg")) { acted = true; continue; } // sobra -> globais
        if (O.buyGlobal("rng")) { acted = true; continue; }
      }
    };
    let guard = 0;
    while (guard++ < 20000) {
      const s = O.snapshot();
      if (s.gameOver) break;
      if (s.wave > 22) break;       // já provou que passou de 20
      if (!s.running) { O.addLives(200); spend(); O.startWave(); }
      O.step(0.5);
    }
    return O.snapshot();
  });
  expect(r.endless).toBe(true);
  expect(r.won).toBe(false);          // modo infinito nunca "vence"
  expect(r.wave).toBeGreaterThan(20); // passou da onda 20
});

test("novos inimigos (voador e curandeiro) aparecem nas ondas", async ({ page }) => {
  const r = await page.evaluate(() => {
    const O = window.__OVERHEAD;
    O.startLevel(5); O.setSpeed(0); // fase 5 libera voador + curandeiro
    // board forte pra sobreviver até as ondas que introduzem os novos tipos
    for (const [t, n] of [["doom", 3], ["doom", 4], ["doom", 5], ["soul", 0], ["soul", 1]]) O.build(t, n);
    const nodeCount = O.nodeCount();
    const spend = () => {
      let acted = true;
      while (acted) {
        acted = false;
        const free = O.freeNodes();
        if (free.length && O.build("doom", free[0])) { acted = true; continue; }
        for (let n = 0; n < nodeCount; n++) { if (O.upgradeAt(n)) { acted = true; break; } }
      }
    };
    let maxFlying = 0, maxHealers = 0, guard = 0;
    while (guard++ < 20000) {
      const s = O.snapshot();
      maxFlying = Math.max(maxFlying, s.flying);
      maxHealers = Math.max(maxHealers, s.healers);
      if (s.gameOver) break;
      if (s.wave > 9 && !s.running) break; // já passou das ondas 4 e 7
      if (!s.running) { spend(); O.startWave(); }
      O.step(0.4);
    }
    return { maxFlying, maxHealers };
  });
  expect(r.maxFlying).toBeGreaterThan(0);   // voadores (a partir da onda 4)
  expect(r.maxHealers).toBeGreaterThan(0);  // curandeiros (a partir da onda 7)
});
