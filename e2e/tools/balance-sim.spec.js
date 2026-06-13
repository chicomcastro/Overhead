import { test } from "@playwright/test";

// Ferramenta de balanceamento da CAMPANHA (NÃO é teste de regressão — sem asserts).
// Joga CADA fase com um build "razoável" e imprime: venceu?, onda final, score,
// vidas restantes e total vazado. Use os números para calibrar os limiares de
// estrela (star2/star3), a escala de HP e os requisitos por fase.
//   Rodar:  npm run balance
//
// Jogador-robô: cobre os nós (1 em cada 3 vira Esfera Fatal, resto Esfera Arcana),
// melhora as torres em rodízio e despeja o excedente em melhorias globais.

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.evaluate(() => {
    localStorage.setItem("overhead_prefs_v1", JSON.stringify({
      sound: false, speed: 1, endless: false, seenTutorial: true,
      difficulty: "normal", volume: 0, music: false, map: "serpent",
    }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);
}

async function playLevel(page, id) {
  return page.evaluate((id) => {
    const O = window.__OVERHEAD;
    O.startLevel(id);
    O.setSpeed(0);
    function manage() {
      let free = O.freeNodes();
      while (free.length) {
        const mana = O.snapshot().mana;
        const built = O.nodes().filter((n) => n.taken).length;
        if (built % 3 === 2 && mana >= 34) O.build("doom", free[0]);
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
  }, id);
}

test("balance campanha (por fase)", async ({ page }) => {
  await boot(page);
  const n = await page.evaluate(() => window.__OVERHEAD.levelCount());
  console.log("\n===== CAMPANHA (bot razoável: build forte + ondas no ritmo) =====");
  console.log("fase | venceu | onda | vidas | vazou | tempo(s) | invicto | rápido | ★ bot");
  for (let id = 1; id <= n; id++) {
    const r = await playLevel(page, id);
    console.log(
      `  ${id}  |  ${r.won ? "SIM" : "não"}  |  ${String(r.wave).padStart(2)} | ${String(r.lives).padStart(3)} | ${String(r.leaked).padStart(3)} | ${String(r.time.toFixed(0)).padStart(4)} |   ${r.ri.flawless ? "✓" : "·"}    |   ${r.ri.fast ? "✓" : "·"}   | ${r.ri.stars}★`
    );
  }
});
