// PWA: o jogo é instalável (manifest + ícone) e jogável offline (service worker
// cacheia o app shell). Roda só no desktop (Chromium) — o fluxo de SW/offline é
// o mesmo; evita duplicar no projeto mobile.
import { test, expect } from "@playwright/test";

test.describe("PWA", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "SW/offline em Chromium");

  test("manifest e ícone declarados", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => !!window.__OVERHEAD);
    expect(await page.getAttribute('link[rel="manifest"]', "href")).toContain("manifest.webmanifest");
    expect(await page.getAttribute('link[rel="icon"]', "href")).toContain("icon.svg");

    // o manifest tem os campos essenciais
    const m = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]').href;
      return (await fetch(href)).json();
    });
    expect(m.name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.icons.length).toBeGreaterThan(0);
  });

  test("service worker controla a página e o jogo abre offline", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForFunction(() => !!window.__OVERHEAD);
    // espera o SW ativar e assumir o controle
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });

    // offline: o app shell vem do cache e o jogo carrega
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.__OVERHEAD, null, { timeout: 8000 });
    await expect(page.locator("#overlay-btn")).toBeVisible();
    await context.setOffline(false);
  });
});
