import { test } from "@playwright/test";

// Ferramenta de balanceamento da CAMPANHA (NÃO é teste de regressão — sem asserts).
// Joga CADA fase de CADA território com um build "razoável" e imprime: venceu?,
// onda final, score, vidas restantes e total vazado. Use os números para calibrar
// os limiares de estrela (star2/star3), a escala de HP e os requisitos por fase.
//   Rodar:  npm run balance
//
// Jogador-robô: cobre os nós com mix de torres (Arcana + Fatal + torre do
// território), melhora em rodízio e despeja excedente em globais.

const TERRITORY_IDS = ["reino", "floresta", "vulcao", "oceano"];
const TERRITORY_TOWER = {
  reino: null,
  floresta: "poison",
  vulcao: "deepfrost",
  oceano: "lightning",
};

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.evaluate(() => {
    localStorage.setItem("overhead_prefs_v1", JSON.stringify({
      sound: false, speed: 1, endless: false, seenTutorial: true,
      difficulty: "normal", volume: 0, music: false, map: "serpent",
    }));
    // desbloqueia todos os territórios dando 30★ em cada
    const save = { _version: 2, territories: {} };
    for (const tid of ["reino", "floresta", "vulcao", "oceano"]) {
      save.territories[tid] = { levels: {} };
      for (let i = 1; i <= 10; i++) save.territories[tid].levels[i] = { best: 9999, stars: 3 };
    }
    localStorage.setItem("overhead_campaign_v2", JSON.stringify(save));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);
}

async function playLevel(page, id, tid) {
  const towerExtra = TERRITORY_TOWER[tid];
  return page.evaluate(({ id, tid, towerExtra }) => {
    const O = window.__OVERHEAD;
    O.setTerritory(tid);
    O.startLevel(id, tid);
    O.setSpeed(0);
    function manage() {
      let free = O.freeNodes();
      while (free.length) {
        const mana = O.snapshot().mana;
        const built = O.nodes().filter((n) => n.taken).length;
        const cycle = towerExtra ? ["arcane", "doom", towerExtra] : ["arcane", "doom"];
        const pick = cycle[built % cycle.length];
        const cost = pick === "doom" ? 34 : pick === "arcane" ? 14 : 40;
        if (built % 3 === 2 && mana >= 34) O.build("doom", free[0]);
        else if (mana >= cost) O.build(pick, free[0]);
        else if (mana >= 14) O.build("arcane", free[0]);
        else break;
        free = O.freeNodes();
      }
      for (let pass = 0; pass < 16; pass++) {
        const occ = O.nodes().filter((n) => n.taken).map((n) => n.i);
        let any = false;
        for (const i of occ) if (O.upgradeAt(i)) any = true;
        if (!any) break;
      }
      let guard = 0;
      while (guard++ < 40) {
        const s = O.snapshot().mana;
        if (s >= O.globalCost("dmg") + 80) O.buyGlobal("dmg");
        else if (s >= O.globalCost("rng") + 80) O.buyGlobal("rng");
        else break;
      }
    }
    let leaked = 0, guardW = 0;
    while (guardW++ < 40) {
      const s = O.snapshot();
      if (s.gameOver) break;
      manage();
      const pre = O.snapshot();
      O.startWave();
      let g = 0;
      while (g++ < 1200) {
        O.step(0.5);
        const ss = O.snapshot();
        if (ss.gameOver) break;
        if (!ss.running && ss.enemies === 0 && ss.queued === 0) break;
      }
      const post = O.snapshot();
      leaked += Math.max(0, pre.lives - post.lives);
      if (post.gameOver) break;
    }
    const f = O.snapshot();
    const ri = O.lastResultInfo ? O.lastResultInfo() : { stars: 0, flawless: false, fast: false };
    return { won: f.won, wave: f.wave, score: f.score, lives: f.lives, leaked, time: f.time, ri };
  }, { id, tid, towerExtra });
}

test("balance campanha (por território e fase)", async ({ page }) => {
  await boot(page);
  console.log("\n===== CAMPANHA — BALANCEAMENTO POR TERRITÓRIO =====\n");
  for (const tid of TERRITORY_IDS) {
    await page.evaluate((tid) => window.__OVERHEAD.setTerritory(tid), tid);
    const n = await page.evaluate(() => window.__OVERHEAD.levelCount());
    const tname = await page.evaluate((tid) => {
      const t = window.__OVERHEAD.config().territories;
      return t ? t.find(x => x.id === tid)?.name : tid;
    }, tid);
    console.log(`\n--- ${tname || tid} (${n} fases, torre extra: ${TERRITORY_TOWER[tid] || "nenhuma"}) ---`);
    console.log("fase | venceu | onda | vidas | vazou | tempo(s) | invicto | rápido | ★ bot");
    for (let id = 1; id <= n; id++) {
      const r = await playLevel(page, id, tid);
      console.log(
        `  ${String(id).padStart(2)} |  ${r.won ? "SIM" : "não"}  |  ${String(r.wave).padStart(2)} | ${String(r.lives).padStart(3)} | ${String(r.leaked).padStart(3)} | ${String(r.time.toFixed(0)).padStart(4)} |   ${r.ri.flawless ? "✓" : "·"}    |   ${r.ri.fast ? "✓" : "·"}   | ${r.ri.stars}★`
      );
    }
  }
});
