// Joga CADA fase de CADA território com um bot razoável e gera
// reports/balance.json + reports/balance.md (publicados no CI).
import { test, expect } from "@playwright/test";
import { writeJSON, writeText } from "./helpers.js";

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "balanceamento é independente de layout");
});

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  await page.evaluate(() => {
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
  await page.reload();
  await page.waitForFunction(() => !!window.__OVERHEAD);
}

async function playLevel(page, id, tid, towerExtra) {
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

test("coleta dados de balanceamento por território", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await boot(page);

  const territories = await page.evaluate(() => window.__OVERHEAD.territories());
  const data = {};

  for (const t of territories) {
    await page.evaluate((tid) => window.__OVERHEAD.setTerritory(tid), t.id);
    const n = await page.evaluate(() => window.__OVERHEAD.levelCount());
    const phases = [];
    for (let id = 1; id <= n; id++) {
      const r = await playLevel(page, id, t.id, t.towerUnlock);
      phases.push({ id, ...r });
    }
    data[t.id] = { name: t.name, towerUnlock: t.towerUnlock, mechanic: t.mechanic, phases };
  }

  const report = { generatedAt: new Date().toISOString(), data };
  writeJSON("balance.json", report);

  // gera markdown legível
  let md = `# Balanceamento — Overhead\n\n`;
  md += `Gerado em ${report.generatedAt}\n\n`;

  let totalWins = 0, totalPhases = 0;
  for (const [tid, t] of Object.entries(data)) {
    const wins = t.phases.filter(p => p.won).length;
    totalWins += wins;
    totalPhases += t.phases.length;
    const stars = t.phases.reduce((s, p) => s + p.ri.stars, 0);
    md += `## ${t.name}`;
    if (t.towerUnlock) md += ` — torre: \`${t.towerUnlock}\``;
    if (t.mechanic) md += ` — mecânica: \`${t.mechanic}\``;
    md += `\n\n`;
    md += `**${wins}/${t.phases.length}** fases vencidas · **${stars}★** total (bot)\n\n`;
    md += `| Fase | Resultado | Onda | Vidas | Vazou | Tempo | ★ |\n`;
    md += `|---:|:---:|---:|---:|---:|---:|:---:|\n`;
    for (const p of t.phases) {
      md += `| ${p.id} | ${p.won ? "✅" : "❌"} | ${p.wave} | ${p.lives} | ${p.leaked} | ${p.time.toFixed(0)}s | ${p.ri.stars}★ |\n`;
    }
    md += `\n`;
  }
  md += `---\n**Total: ${totalWins}/${totalPhases} fases vencidas** (bot razoável, dificuldade Normal)\n`;
  writeText("balance.md", md);

  await testInfo.attach("balance.md", { body: md, contentType: "text/markdown" });
  await testInfo.attach("balance.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });

  // sanity: bot deve vencer ao menos a fase 1 de cada território
  for (const [tid, t] of Object.entries(data)) {
    expect(t.phases[0].won, `${t.name} fase 1 deve ser vencível`).toBe(true);
  }
});
