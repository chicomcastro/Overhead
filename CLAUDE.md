# Overhead — Web Tower Defense

## Projeto

Tower defense originalmente feito em Unity, com remasterização web standalone em `web/`.
O jogo roda abrindo `web/index.html` no browser (ou servindo a pasta, ex: `cd web && python3 -m http.server`).
Deploy automático no GitHub Pages (branch `master`, workflow `.github/workflows/pages.yml`).

## Estrutura

```
web/
  game.js          # toda a lógica do jogo (~2400 linhas, vanilla JS)
  index.html       # shell HTML + modais
  style.css        # estilos (~1060 linhas)
  icon.svg         # ícone PWA
  service-worker.js
  manifest.webmanifest
e2e/               # testes Playwright (desktop + mobile)
docs/
  BACKLOG.md       # fonte de verdade do backlog (sem issues no GH)
  adrs/            # Architecture Decision Records
unity/             # projeto Unity original (legado, não usado pela versão web)
```

## Convenções

- **Linguagem dos commits/PRs:** português.
- **Branch:** tudo direto na `master`, squash-merge via PR.
- **Um único arquivo JS** (`game.js`) — sem bundler, sem framework.
- **Sem dependências de runtime** — Web Audio API para sons, canvas 2D para render.
- **PWA** — service worker cacheia o app shell; atualizar `CACHE_VERSION` ao mudar assets.
- **API de debug** — `window.__OVERHEAD` expõe hooks para os testes e2e.

## Testes

```bash
cd e2e && npm ci && npx playwright test   # desktop + mobile
```

## Dev workflow

1. Editar arquivos em `web/`.
2. Abrir `web/index.html` no browser para testar (ou `python3 -m http.server` na pasta `web/`).
3. PR squash-merge na `master` → deploy automático no Pages.
