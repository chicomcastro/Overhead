// Joga partidas completas automaticamente e coleta métricas por onda para
// embasar rebalanceamento. Gera reports/balance.json e reports/balance.md.
import { test, expect } from "@playwright/test";
import { boot, snap, api, step, writeJSON, writeText } from "./helpers.js";

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

async function playMatch(page, loadout) {
  await page.evaluate(() => window.__OVERHEAD.setSpeed(0));
  const mainType = loadout[0][0]; // tipo preferido para expandir
  // monta o loadout inicial (o que couber nas almas)
  for (const [type, node] of loadout) await api(page, "build", type, node);

  const nodeCount = await api(page, "nodeCount");

  // Gasta as almas disponíveis: primeiro constrói torres novas em nós livres,
  // depois sobe o nível das existentes — repete até não conseguir mais nada.
  async function spendSouls() {
    let acted = true;
    while (acted) {
      acted = false;
      const free = await api(page, "freeNodes");
      if (free.length && (await api(page, "build", mainType, free[0]))) { acted = true; continue; }
      for (let n = 0; n < nodeCount; n++) {
        if (await api(page, "upgradeAt", n)) { acted = true; break; }
      }
    }
  }

  const perWave = [];
  let guard = 0;
  let prevLives = (await snap(page)).lives;

  while (guard++ < 6000) {
    const s = await snap(page);
    if (s.gameOver) break;

    // fora de onda: gasta sobra (build + upgrade) e inicia a próxima
    if (!s.running) {
      await spendSouls();
      await api(page, "startWave");
      prevLives = (await snap(page)).lives;
    }

    await step(page, 0.5);

    const after = await snap(page);
    // registra ao fim de cada onda (quando para de rodar e há histórico novo)
    if (!after.running && after.wave > perWave.length && after.wave > 0) {
      perWave.push({
        wave: after.wave,
        livesLeft: after.lives,
        leaked: Math.max(0, prevLives - after.lives),
        souls: after.souls,
        score: after.score,
        towers: after.towers.length,
        avgTowerLevel: after.towers.length
          ? +(after.towers.reduce((a, t) => a + t.level, 0) / after.towers.length).toFixed(2)
          : 0,
      });
    }
    if (after.gameOver) break;
  }

  const final = await snap(page);
  return { final, perWave };
}

test("coleta dados de balanceamento de várias estratégias", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
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
