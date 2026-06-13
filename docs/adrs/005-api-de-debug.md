# ADR-005: API de debug via `window.__OVERHEAD`

**Data:** 2026-05-30  
**Status:** Aceita  
**PR:** #4 (testes e2e)

## Contexto

Os testes e2e precisam controlar o jogo de forma determinística: construir torres, avançar ondas, inspecionar estado. Interagir só via cliques/toques seria lento, frágil e não permitiria simulações de balanceamento.

## Decisão

O jogo expõe `window.__OVERHEAD` com hooks determinísticos: `build`, `step`, `snapshot`, `startWave`, `setZoom`, `reset`, etc. Esses hooks são usados exclusivamente pelos testes e2e e pela ferramenta de simulação de balanceamento. Não alteram o comportamento do jogo para o jogador.

## Consequências

- Testes rápidos e estáveis: partidas completas rodam dentro de um único `page.evaluate`, sem round-trips de IPC por passo.
- Simulação de balanceamento (`e2e/tools/balance-sim.spec.js`) usa a mesma API para jogar partidas automaticamente e coletar métricas.
- A API é pública no browser (qualquer um pode inspecionar), mas isso é aceitável para um jogo client-side.
