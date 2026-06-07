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
    await expect(page.locator("#overlay-btn")).toContainText("Mapa de fases");
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

  test("'Mapa de fases' (resultado) reabre o mapa de fases", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__OVERHEAD.endGame(false));
    await page.locator("#overlay-btn").click(); // "Mapa de fases"
    await expect(page.locator("#levels")).toHaveClass(/show/);
  });
});

test.describe("dificuldade", () => {
  test("escolher Fácil/Difícil ajusta recursos iniciais e HP", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.locator("#difficulty-modes .seg-btn")).toHaveCount(3);

    // Fácil: mais almas/vidas (Jogar → mapa de fases → inicia a fase 1)
    await page.locator("#difficulty-modes .seg-btn", { hasText: "Fácil" }).click();
    await page.evaluate(() => window.__OVERHEAD.startLevel(1));
    let s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    expect(s.souls).toBe(50);
    expect(s.lives).toBe(25);
    expect(await page.evaluate(() => window.__OVERHEAD.difficulty())).toBe("easy");

    // Difícil (via menu de pausa → menu principal → trocar)
    await page.locator("#pause-btn").click();
    await page.locator("#menu-btn").click();
    await page.locator("#difficulty-modes .seg-btn", { hasText: "Difícil" }).click();
    await page.evaluate(() => window.__OVERHEAD.startLevel(1));
    s = await page.evaluate(() => window.__OVERHEAD.snapshot());
    expect(s.souls).toBe(30);
    expect(s.lives).toBe(15);
  });
});

test.describe("campanha", () => {
  test("mapa de fases: estrelas, melhor pontuação e desbloqueio", async ({ page }) => {
    await gotoFresh(page);
    await page.evaluate(() => { localStorage.removeItem("overhead_campaign_v1"); window.__OVERHEAD.resetTutorial(); });
    await page.reload();
    await page.waitForFunction(() => !!window.__OVERHEAD);

    // "Jogar" abre o mapa de fases com as 3 fases; a 2 começa bloqueada
    await page.locator("#overlay-btn").click();
    await expect(page.locator("#levels")).toHaveClass(/show/);
    const total = await page.evaluate(() => window.__OVERHEAD.levelCount());
    await expect(page.locator(".level-card")).toHaveCount(total);
    expect(await page.evaluate(() => window.__OVERHEAD.levelInfo(2).unlocked)).toBe(false);

    // joga a fase 1 e vence com pontuação alta → 3★
    await page.evaluate(() => window.__OVERHEAD.startLevel(1));
    if (await page.evaluate(() => window.__OVERHEAD.coachVisible())) await page.locator("#coach-ok").click();
    expect(await page.evaluate(() => window.__OVERHEAD.levelId())).toBe(1);
    await page.evaluate(() => { window.__OVERHEAD.setScore(9999); window.__OVERHEAD.endGame(true); });

    // resultado mostra estrelas + botão mapa de fases
    await expect(page.locator("#result-stars")).toBeVisible();
    await expect(page.locator("#overlay-btn")).toContainText("Mapa de fases");

    // progresso: fase 1 com 3★ e melhor pontuação; fase 2 desbloqueada
    expect(await page.evaluate(() => window.__OVERHEAD.levelInfo(1).stars)).toBe(3);
    expect(await page.evaluate(() => window.__OVERHEAD.levelInfo(1).best)).toBeGreaterThanOrEqual(9999);
    expect(await page.evaluate(() => window.__OVERHEAD.levelInfo(2).unlocked)).toBe(true);

    // voltar ao mapa de fases: a fase 2 agora está aberta (desbloqueio acumulado)
    await page.locator("#overlay-btn").click();
    await expect(page.locator("#levels")).toHaveClass(/show/);
    expect(await page.evaluate(() => window.__OVERHEAD.levelInfo(2).unlocked)).toBe(true);
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
    await page.locator("#options-btn").click();   // áudio fica dentro de Opções
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

test.describe("bestiário", () => {
  test("abre, lista todos os inimigos e fecha", async ({ page }) => {
    await gotoFresh(page);
    await page.locator("#bestiary-btn").click();
    const dlg = page.locator("#bestiary");
    await expect(dlg).toHaveClass(/show/);
    // um item por tipo de inimigo
    const types = await page.evaluate(() => window.__OVERHEAD.enemyTypeCount());
    await expect(page.locator(".bestiary-row")).toHaveCount(types);
    await expect(page.locator(".bestiary-row").first().locator(".be-name")).not.toBeEmpty();
    await page.locator("#bestiary-close").click();
    await expect(dlg).not.toHaveClass(/show/);
  });
});

test.describe("habilidades ativas", () => {
  test("Congelar deixa todos os inimigos lentos e entra em cooldown", async ({ page }) => {
    await boot(page);
    // tudo num único evaluate: sem rAF interferindo (spawns) entre as medições
    const r = await page.evaluate(() => {
      const O = window.__OVERHEAD;
      O.startWave(); O.step(2);
      const before = O.snapshot().enemies;
      O.useAbility("freeze");
      const s = O.snapshot();
      return { before, enemies: s.enemies, slowed: s.slowed, cd: O.abilityCd("freeze") };
    });
    expect(r.before).toBeGreaterThan(0);
    expect(r.slowed).toBe(r.enemies);                 // todos lentos
    expect(r.cd).toBeGreaterThan(0);
    await expect(page.locator("#ability-freeze")).toBeDisabled(); // botão reflete o cooldown
  });

  test("Tempestade causa dano em área a todos os inimigos", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const O = window.__OVERHEAD;
      O.startWave(); O.step(2);
      const before = O.enemyHpTotal();
      O.useAbility("storm");
      return { before, after: O.enemyHpTotal(), cd: O.abilityCd("storm") };
    });
    expect(r.before).toBeGreaterThan(0);
    expect(r.after).toBeLessThan(r.before);
    expect(r.cd).toBeGreaterThan(0);
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
    await expect(page.locator("#difficulty-modes")).toBeVisible(); // controles de menu voltam
  });
});

test.describe("bottom sheets (polish)", () => {
  test("× padronizado fecha cada sheet e todos têm o botão", async ({ page }) => {
    await gotoFresh(page);
    // todo sheet (exceto o overlay de menu) tem um .sheet-close
    const sheets = ["levels", "options-sheet", "howto-sheet", "bestiary", "pause-menu"];
    for (const id of sheets) {
      expect(await page.locator(`#${id} .sheet-close`).count()).toBe(1);
    }
    // abrir Opções e fechar pelo ×
    await page.locator("#options-btn").click();
    await expect(page.locator("#options-sheet")).toHaveClass(/show/);
    await page.locator("#options-sheet .sheet-close").click();
    await expect(page.locator("#options-sheet")).not.toHaveClass(/show/);
  });

  test("arrastar pra baixo a partir do topo fecha o sheet", async ({ page }) => {
    await gotoFresh(page);
    await page.locator("#options-btn").click();
    const sheet = page.locator("#options-sheet");
    await expect(sheet).toHaveClass(/show/);
    await page.waitForTimeout(400); // deixa a animação de subida do sheet assentar
    const box = await sheet.locator(".panel").boundingBox();
    const x = box.x + box.width / 2;
    // pointerdown na faixa do puxador (topo) → arrasta pra baixo → solta
    await page.mouse.move(x, box.y + 12);
    await page.mouse.down();
    for (const dy of [40, 100, 160, 230]) await page.mouse.move(x, box.y + dy, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).not.toHaveClass(/show/);
  });
});
