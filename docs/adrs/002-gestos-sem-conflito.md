# ADR-002: Gestos sem conflito (1 dedo vs 2 dedos)

**Data:** 2026-06-04  
**Status:** Aceita  
**PR:** #7, #8, #10

## Contexto

No mobile, toque e gestos de câmera competem pelo mesmo input. Construir torre, selecionar torre, zoom e pan precisam coexistir sem ambiguidade.

## Decisão

1 dedo = construir/selecionar (ação de jogo). 2 dedos = zoom (pinça) e pan (arrastar). No desktop, clique = ação, scroll = zoom, arrastar = pan quando ampliado.

## Consequências

- Nenhum gesto de jogo conflita com navegação da câmera.
- Construção por toque usa `touchend` (não `click`), pois `preventDefault` no touch mata o evento de click sintético.
- Feedback tátil (vibração) reforça a ação de construir no mobile.
