# ADR-004: Regressão visual via DOM, não pixel-diff

**Data:** 2026-05-30  
**Status:** Aceita  
**PR:** #8

## Contexto

Testes de regressão visual por screenshot (pixel-diff) são frágeis entre ambientes: fontes, antialiasing e DPI variam entre máquina local e `ubuntu-latest` do CI. Sem container Docker pinado, os diffs seriam ruidosos e não confiáveis.

## Decisão

O *layout guard* (`e2e/tests/layout.spec.js`) valida a estrutura do DOM: elementos certos visíveis/escondidos, contagens corretas, sem overflow horizontal no mobile, controles dentro da viewport. Não compara pixels.

## Consequências

- Testes determinísticos e estáveis entre ambientes (local, CI, diferentes SOs).
- Pega a classe de bug que importa: layout quebrado, item cortado, elemento faltando.
- Não detecta regressões puramente visuais (cor errada, espaçamento sutil) — aceitável para este projeto.
