// Cobre as features de gameplay/polish: prioridade de alvo por torre,
// prévia da próxima onda e a tela de fim de jogo (vitória/derrota + share).
import { test, expect } from "@playwright/test";
import { boot } from "./helpers.js";

async function gotoFresh(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
}

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

test.describe("dificuldade", () => {
  test("escolher Fácil/Difícil ajusta recursos iniciais e HP", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.locator("#difficulty-modes .seg-btn")).toHaveCount(3);

    // Fácil: mais almas/vidas
    await page.locator("#difficulty-modes .seg-btn", { hasText: "Fácil" }).click();
    await page.locator("#overlay-btn").click();
    let s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    expect(s.souls).toBe(50);
    expect(s.lives).toBe(25);
    expect(await page.evaluate(() => window.__OVERHEAD.difficulty())).toBe("easy");

    // Difícil: menos almas/vidas (via menu de pausa → menu principal → trocar)
    await page.locator("#pause-btn").click();
    await page.locator("#menu-btn").click();
    await page.locator("#difficulty-modes .seg-btn", { hasText: "Difícil" }).click();
    await page.locator("#overlay-btn").click();
    s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    expect(s.souls).toBe(30);
    expect(s.lives).toBe(15);
  });
});

test.describe("feedback de dano no núcleo", () => {
  test("vazamento dispara tremor/vinheta", async ({ page }) => {
    await boot(page);
    // sem torres: a 1ª onda vaza; captura o fx no quadro do vazamento
    const fx = await page.evaluate(() => {
      const O = window.__OVERHEAD;
      O.startWave();
      const before = O.snapshot().lives;
      for (let i = 0; i < 4000; i++) {
        O.step(0.05);
        if (O.snapshot().lives < before) return O.fxState();
      }
      return null;
    });
    expect(fx).not.toBeNull();
    expect(fx.shake).toBeGreaterThan(0);
    expect(fx.flash).toBeGreaterThan(0);
  });
});

test.describe("áudio", () => {
  test("slider de volume e toggle de música atualizam estado e prefs", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.locator("#volume-slider")).toBeVisible();
    await expect(page.locator("#music-toggle")).toBeVisible();

    // ajusta volume via slider
    await page.locator("#volume-slider").fill("80");
    await page.locator("#volume-slider").dispatchEvent("input");
    expect(await page.evaluate(() => window.__OVERHEAD.audioState().volume)).toBeCloseTo(0.8, 1);

    // música começa ligada; toggle desliga
    expect(await page.evaluate(() => window.__OVERHEAD.audioState().music)).toBe(true);
    await page.locator("#music-toggle").click();
    expect(await page.evaluate(() => window.__OVERHEAD.audioState().music)).toBe(false);
    await expect(page.locator("#music-toggle")).not.toHaveClass(/active/);

    // persiste entre reloads
    await page.reload();
    await page.waitForFunction(() => !!window.__OVERHEAD);
    expect(await page.evaluate(() => window.__OVERHEAD.audioState().music)).toBe(false);
    expect(await page.evaluate(() => window.__OVERHEAD.audioState().volume)).toBeCloseTo(0.8, 1);
  });
});

test.describe("menu de pausa", () => {
  test("pausar abre o menu com continuar/reiniciar/menu", async ({ page }) => {
    await boot(page);
    await page.locator("#pause-btn").click();
    await expect(page.locator("#pause-menu")).toHaveClass(/show/);
    expect(await page.evaluate(() => window.__OVERHEAD.isPaused())).toBe(true);
    for (const id of ["#resume-btn", "#restart-btn", "#menu-btn"]) {
      await expect(page.locator(id)).toBeVisible();
    }
    // continuar fecha o menu e despausa
    await page.locator("#resume-btn").click();
    await expect(page.locator("#pause-menu")).not.toHaveClass(/show/);
    expect(await page.evaluate(() => window.__OVERHEAD.isPaused())).toBe(false);
  });

  test("reiniciar zera a fase (torres e onda)", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__OVERHEAD.addSouls(500));
    const node = await page.evaluate(() => window.__OVERHEAD.freeNodes()[0]);
    await page.evaluate((n) => window.__OVERHEAD.build("soul", n), node);
    await page.evaluate(() => window.__OVERHEAD.startWave());

    await page.locator("#pause-btn").click();
    await page.locator("#restart-btn").click();

    const s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    expect(s.towers.length).toBe(0);
    expect(s.wave).toBe(0);
    expect(s.running).toBe(false);
    await expect(page.locator("#pause-menu")).not.toHaveClass(/show/);
  });

  test("menu principal volta ao menu (modo jogo, sem resultado)", async ({ page }) => {
    await boot(page);
    await page.locator("#pause-btn").click();
    await page.locator("#menu-btn").click();
    const ov = page.locator("#overlay");
    await expect(ov).toHaveClass(/show/);
    await expect(ov).not.toHaveClass(/result/);
    await expect(page.locator("#overlay-btn")).toHaveText("Jogar");
    await expect(page.locator("#how-to")).toBeVisible(); // conteúdo de menu volta
  });
});
