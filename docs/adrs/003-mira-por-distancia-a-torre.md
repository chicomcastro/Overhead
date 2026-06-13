# ADR-003: Mira por distância à Torre (não por progresso no caminho)

**Data:** 2026-06-04  
**Status:** Aceita  
**PR:** #11

## Contexto

Torres precisam priorizar qual inimigo atacar. A abordagem natural seria "mais avançado no caminho", mas isso não funciona com voadores (Grifos), que cortam em linha reta até a Torre ignorando o caminho.

## Decisão

A prioridade de alvo usa distância euclidiana até a Torre (CORE), não progresso no caminho. Cada modo de mira (Torre/Forte/Fraco/Perto) é um peso por inimigo; a torre ataca o de menor peso dentro do alcance.

## Consequências

- Voadores são tratados de forma justa: um Grifo perto da Torre tem prioridade alta automaticamente.
- A mecânica é intuitiva para o jogador: "mais perto da Torre = mais ameaçador".
- Não requer cálculo de progresso no caminho para inimigos que não seguem o caminho.
