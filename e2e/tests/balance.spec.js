// Joga partidas completas automaticamente e coleta métricas por onda para
// embasar rebalanceamento. Gera reports/balance.json e reports/balance.md.
import { test, expect } from "@playwright/test";
import { boot, api, writeJSON, writeText } from "./helpers.js";

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "balanceamento é independente de layout");
});

// Loadouts de teste: [typeId, nodeIndex][]
const STRATEGIES = {
  "soul-rush": [["soul", 0], ["soul", 1], ["soul", 3], ["soul", 4], ["soul", 5]],
  "doom-core": [["doom", 3], ["doom", 4], ["doom", 5], ["frost", 0], ["frost", 1]],
  "mixed":     [["soul", 0], ["frost", 3], ["doom", 4], ["blast", 5], ["soul", 1]],
};

// Toda a partida roda DENTRO do browser (um único evaluate), sem round-trip
// de IPC por passo — isso a torna ~instantânea e estável no CI.
async function playMatch(page, loadout) {
  return page.evaluate((loadout) => {
    const O = window.__OVERHEAD;
    O.reset();
    O.setSpeed(0); // só o nosso stepping controla o tempo
    const mainType = loadout[0][0];
    for (const [type, node] of loadout) O.build(type, node);
    const nodeCount = O.nodeCount();

    // Gasta as almas: primeiro constrói em nós livres, depois sobe níveis.
    const spend = () => {
      let acted = true;
      while (acted) {
        acted = false;
        const free = O.freeNodes();
        if (free.length && O.build(mainType, free[0])) { acted = true; continue; }
        for (let n = 0; n < nodeCount; n++) { if (O.upgradeAt(n)) { acted = true; break; } }
      }
    };

    const perWave = [];
    let guard = 0;
    let prevLives = O.snapshot().lives;

    while (guard++ < 20000) {
      const s = O.snapshot();
      if (s.gameOver) break;
      if (!s.running) { spend(); O.startWave(); prevLives = O.snapshot().lives; }

      O.step(0.5);

      const a = O.snapshot();
      if (!a.running && a.wave > perWave.length && a.wave > 0) {
        perWave.push({
          wave: a.wave,
          livesLeft: a.lives,
          leaked: Math.max(0, prevLives - a.lives),
          souls: a.souls,
          score: a.score,
          towers: a.towers.length,
          avgTowerLevel: a.towers.length
            ? +(a.towers.reduce((acc, t) => acc + t.level, 0) / a.towers.length).toFixed(2)
            : 0,
        });
      }
      if (a.gameOver) break;
    }

    return { final: O.snapshot(), perWave };
  }, loadout);
}

test("coleta dados de balanceamento de várias estratégias", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const results = {};
  for (const [name, loadout] of Object.entries(STRATEGIES)) {
    await boot(page);
    const r = await playMatch(page, loadout);
    results[name] = r;
    // todas as estratégias devem ao menos sobreviver às primeiras ondas
    expect(r.final.wave).toBeGreaterThanOrEqual(3);
  }

  const cfg = await api(page, "config");
  const report = { generatedAt: new Date().toISOString(), config: cfg, results };
  writeJSON("balance.json", report);

  // markdown legível p/ anexar no PR
  let md = `# Relatório de balanceamento — Overhead\n\n`;
  md += `Gerado em ${report.generatedAt}\n\n`;
  for (const [name, r] of Object.entries(results)) {
    md += `## Estratégia: \`${name}\`\n\n`;
    md += `Resultado: **${r.final.won ? "Vitória 🏆" : "Derrota"}** — chegou à onda **${r.final.wave}**, `;
    md += `vidas **${r.final.lives}**, pontuação **${r.final.score}**\n\n`;
    md += `| Onda | Vidas | Vazaram | Almas | Pontos | Torres | Nível médio |\n`;
    md += `|---:|---:|---:|---:|---:|---:|---:|\n`;
    for (const w of r.perWave) {
      md += `| ${w.wave} | ${w.livesLeft} | ${w.leaked} | ${w.souls} | ${w.score} | ${w.towers} | ${w.avgTowerLevel} |\n`;
    }
    md += `\n`;
  }
  writeText("balance.md", md);

  // anexa ao relatório do Playwright
  await testInfo.attach("balance.md", { body: md, contentType: "text/markdown" });
  await testInfo.attach("balance.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
});
