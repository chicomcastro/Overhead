import { test } from "@playwright/test";

// Ferramenta de balanceamento (NÃO é teste de regressão — sem asserts).
// Joga as 20 ondas com uma estratégia fixa "razoável" e imprime a progressão
// por onda, em cada dificuldade. Use para comparar números antes/depois de
// ajustar o balanceamento.  Rodar:  npm run balance
//
// Estratégia do jogador-robô:
//  - cobre os nós: 1 em cada 3 vira Esfera Fatal (doom), o resto Esfera de Alma;
//  - melhora as torres em rodízio enquanto puder pagar;
//  - despeja o excedente de almas em melhorias globais (dmg, depois rng).

async function startWith(page, difficulty) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.evaluate((d) => {
    localStorage.setItem("overhead_prefs_v1", JSON.stringify({
      sound: false, speed: 1, endless: false, seenTutorial: true,
      difficulty: d, volume: 0, music: false, map: "serpent",
    }));
  }, difficulty);
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.locator("#overlay-btn").click();
}

async function simulate(page) {
  return page.evaluate(() => {
    const O = window.__OVERHEAD;
    function manage() {
      // 1) cobre nós livres (1 doom a cada 3, resto soul)
      let free = O.freeNodes();
      while (free.length) {
        const souls = O.snapshot().souls;
        const built = O.nodes().filter((n) => n.taken).length;
        if (built % 3 === 2 && souls >= 34) O.build("doom", free[0]);
        else if (souls >= 14) O.build("soul", free[0]);
        else break;
        free = O.freeNodes();
      }
      // 2) melhora torres em rodízio enquanto puder pagar
      for (let pass = 0; pass < 16; pass++) {
        const occ = O.nodes().filter((n) => n.taken).map((n) => n.i);
        let any = false;
        for (const i of occ) if (O.upgradeAt(i)) any = true;
        if (!any) break;
      }
      // 3) excedente de almas -> melhorias globais
      let guard = 0;
      while (guard++ < 40) {
        const s = O.snapshot().souls;
        if (s >= O.globalCost("dmg") + 80) O.buyGlobal("dmg");
        else if (s >= O.globalCost("rng") + 80) O.buyGlobal("rng");
        else break;
      }
    }
    const log = [];
    for (let w = 1; w <= 20; w++) {
      manage();
      const pre = O.snapshot();
      O.startWave();
      let guard = 0;
      while (guard++ < 800) {
        O.step(0.5);
        const s = O.snapshot();
        if (s.gameOver) break;
        if (!s.running && s.enemies === 0 && s.queued === 0) break;
      }
      const post = O.snapshot();
      log.push({
        w, leaked: pre.lives - post.lives, lives: post.lives, souls: post.souls,
        towers: post.towers.length, lvls: post.towers.reduce((a, t) => a + t.level, 0),
        g: post.globals.dmg + "/" + post.globals.rng, over: post.gameOver, won: post.won,
      });
      if (post.gameOver) break;
    }
    return log;
  });
}

for (const diff of ["easy", "normal", "hard"]) {
  test(`balance ${diff}`, async ({ page }) => {
    await startWith(page, diff);
    const log = await simulate(page);
    const last = log[log.length - 1];
    console.log(`\n===== ${diff.toUpperCase()} =====`);
    console.log("onda | vazou | vidas | almas | torres | nivsoma | glob(dmg/rng)");
    for (const r of log) {
      console.log(
        `${String(r.w).padStart(2)}   |  ${String(r.leaked).padStart(3)}  | ${String(r.lives).padStart(4)} | ${String(r.souls).padStart(5)} |   ${String(r.towers).padStart(2)}   |   ${String(r.lvls).padStart(3)}   | ${r.g}`
      );
    }
    const res = last.won ? "VENCEU as 20 ondas" : "DERROTA na onda " + last.w;
    console.log(`RESULTADO ${diff}: ${res} — vidas finais ${last.lives}`);
  });
}
