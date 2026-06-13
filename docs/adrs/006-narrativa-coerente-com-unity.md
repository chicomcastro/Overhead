# ADR-006: Re-tematização da versão web para coerência com o jogo Unity

**Data:** 2026-06-13  
**Status:** Aceita

## Contexto

A versão Unity original tem uma narrativa clara: o jogador é o Bruxo defendendo sua torre de cavaleiros que tentam resgatar a princesa. A versão web criou uma narrativa desconectada sobre "almas perdidas" atacando um "Núcleo", sem relação com o original.

## Decisão

Re-tematizar toda a versão web para alinhar com a narrativa Unity:

| Antes | Depois |
|---|---|
| Almas (moeda) | Mana |
| Alma (inimigo) | Soldado |
| Espectro | Batedor |
| Carrasco | Cavaleiro |
| Alma Alada | Grifo |
| Sacerdote | Clérigo |
| Ceifador (boss) | Paladino |
| Esfera de Alma | Esfera Arcana |
| "Defenda o Núcleo das almas" | "Você é o Bruxo. Defenda sua Torre dos cavaleiros do reino" |

## Consequências

- Identidade narrativa consistente entre as versões Unity e web.
- Mudança propagada em game.js, index.html, style.css, manifest, service worker e todos os testes e2e.
- IDs internos (`state.mana`, `TOWER_TYPES[0].id = "arcane"`) e a API de debug (`addMana`, `snapshot().mana`) foram renomeados para consistência total, incluindo os testes.
