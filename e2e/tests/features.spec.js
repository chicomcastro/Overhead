// Cobre as features de gameplay/polish: prioridade de alvo por torre,
// prévia da próxima onda e a tela de fim de jogo (vitória/derrota + share).
import { test, expect } from "@playwright/test";
import { boot } from "./helpers.js";

async function buildSoul(page) {
  await page.evaluate(() => window.__OVERHEAD.addSouls(500));
  const node = await page.evaluate(() => window.__OVERHEAD.freeNodes()[0]);
  await page.evaluate((n) => window.__OVERHEAD.build("soul", n), node);
  return node;
}

test.describe("prioridade de alvo", () => {
  test("painel mostra 4 modos e troca o modo da torre", async ({ page }) => {
    await boot(page);
    const node = await buildSoul(page);
    await page.evaluate((n) => window.__OVERHEAD.selectAt(n), node);

    const modes = page.locator("#tp-target-modes .tp-mode");
    await expect(modes).toHaveCount(4);
    // começa em "Núcleo" (core) ativo
    expect(await page.evaluate((n) => window.__OVERHEAD.targetModeAt(n), node)).toBe("core");
    await expect(page.locator("#tp-target-modes .tp-mode.active")).toHaveText("Núcleo");

    // clica em "Forte" → muda o modo da torre
    await page.locator("#tp-target-modes .tp-mode", { hasText: "Forte" }).click();
    expect(await page.evaluate((n) => window.__OVERHEAD.targetModeAt(n), node)).toBe("strong");
    await expect(page.locator("#tp-target-modes .tp-mode.active")).toHaveText("Forte");
  });
});

test.describe("prévia da próxima onda", () => {
  test("aparece fora de combate com a composição correta e some durante a onda", async ({ page }) => {
    await boot(page);
    const wp = page.locator("#wave-preview");
    await expect(wp).toBeVisible();
    await expect(wp.locator(".wp-title")).toContainText("Próxima onda 1");

    // a quantidade de itens bate com os tipos distintos da onda seguinte
    const distinct = await page.evaluate(() => Object.keys(window.__OVERHEAD.nextWaveCounts()).length);
    await expect(wp.locator(".wp-item")).toHaveCount(distinct);

    // durante a onda a prévia some
    await page.evaluate(() => window.__OVERHEAD.startWave());
    await expect(wp).toBeHidden();
  });
});

test.describe("tela de fim de jogo", () => {
  test("derrota: overlay com classe lose, botão de share e 'jogar novamente'", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__OVERHEAD.endGame(false));

    const ov = page.locator("#overlay");
    await expect(ov).toHaveClass(/result/);
    await expect(ov).toHaveClass(/lose/);
    await expect(page.locator("#share-btn")).toBeVisible();
    await expect(page.locator("#overlay-btn")).toHaveText("Jogar novamente");
    // conteúdo de menu fica escondido no resultado
    await expect(page.locator("#how-to")).toBeHidden();
  });

  test("vitória: overlay com classe win", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__OVERHEAD.endGame(true));
    const ov = page.locator("#overlay");
    await expect(ov).toHaveClass(/win/);
    await expect(page.locator("#share-btn")).toBeVisible();
  });

  test("jogar novamente limpa o estado de resultado", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__OVERHEAD.endGame(false));
    await page.locator("#overlay-btn").click();
    const ov = page.locator("#overlay");
    await expect(ov).not.toHaveClass(/result/);
    await expect(ov).not.toHaveClass(/show/);
  });
});
