# Overhead — testes e2e

Testes de ponta a ponta que **jogam o jogo de verdade** num Chromium headless
(via [Playwright](https://playwright.dev)), servindo a pasta `../web`.

Servem para três coisas:

1. **Provar que as mecânicas funcionam** (`tests/mechanics.spec.js`) — construir,
   upgradar, vender, disparo/dano, slow, burn, vazamento de vidas, progressão de ondas.
2. **Gerar dados de balanceamento** (`tests/balance.spec.js`) — joga partidas
   completas com estratégias diferentes e escreve `reports/balance.json` e
   `reports/balance.md` (tabela por onda: vidas, vazamentos, almas, pontos, torres).
3. **Capturar evidência visual** (`tests/screenshots.spec.js`) — screenshots de
   desktop e mobile em momentos-chave, salvos em `reports/screenshots/`.

Os testes conversam com o jogo por uma pequena API de debug exposta em
`window.__OVERHEAD` (definida no fim de `web/game.js`), que permite controlar a
partida de forma determinística (construir, iniciar onda, avançar a simulação por
passos fixos de `dt`, ler um snapshot do estado). Essa API não altera o jogo normal.

## Rodando localmente

```bash
cd e2e
npm install
npx playwright install chromium      # baixa o browser (uma vez)
npm test                             # roda tudo (desktop + mobile)

# úteis:
npx playwright test mechanics --project=desktop
npx playwright test screenshots
npx playwright show-report           # abre o relatório HTML
```

Os artefatos ficam em `e2e/reports/` (ignorado pelo git) e também são anexados ao
relatório do Playwright. No CI, são publicados como artifacts do job a cada PR.
