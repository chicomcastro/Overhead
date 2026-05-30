// Utilitários compartilhados pelos testes e2e do Overhead.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = path.resolve(__dirname, "..", "reports");

export function ensureReports(sub = "") {
  const dir = sub ? path.join(REPORTS_DIR, sub) : REPORTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJSON(file, data) {
  ensureReports();
  fs.writeFileSync(path.join(REPORTS_DIR, file), JSON.stringify(data, null, 2));
}

export function writeText(file, text) {
  ensureReports();
  fs.writeFileSync(path.join(REPORTS_DIR, file), text);
}

// Carrega a página e espera a API de debug do jogo ficar disponível.
export async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__OVERHEAD);
  // tira o menu inicial e zera o estado
  await page.evaluate(() => window.__OVERHEAD.reset());
}

export const snap = (page) => page.evaluate(() => window.__OVERHEAD.snapshot());
export const api = (page, fn, ...args) =>
  page.evaluate(({ fn, args }) => window.__OVERHEAD[fn](...args), { fn, args });

// Avança a simulação `seconds` (em passos fixos), sem depender do rAF.
export const step = (page, seconds) =>
  page.evaluate((s) => window.__OVERHEAD.step(s), seconds);
