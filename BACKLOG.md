# Backlog — Overhead (versão web)

Acompanhamento do que já foi feito, o que está em andamento e o que falta na
remasterização web em [`web/`](web/). Atualize ao concluir cada item.

> Não há issues no GitHub para este projeto; este arquivo é a fonte de verdade
> do backlog. PRs são squash-merge na `master` e o deploy é automático no
> GitHub Pages.

## ✅ Entregue

| PR | Tema | Resumo |
|----|------|--------|
| #6 | Profundidade de endgame | Melhorias globais (ralo de almas), inimigos novos (voador + curandeiro), boss a cada 5 ondas, modo infinito, leaderboard local e persistência de preferências. Fix de mira (voadores). |
| #7 | Toque no mobile | Construir torre por toque (ação no `touchend`, pois `preventDefault` mata o `click`). |
| #8 | Jogabilidade mobile | Alvos de toque maiores, feedback ao construir (✓ + vibração), tutorial de 1ª jogada. + **layout guard** e2e (regressão de layout determinística por DOM, não pixel-diff). |
| #9 | UX/UI mobile | HUD compacto numa linha, painel da torre selecionada (nome/nível/stats/tags), auto-seleção ao construir, fim do overlap loja↔ações. |
| #10 | Câmera | Zoom (1–3×) + pan: pinça/2 dedos no mobile, scroll/arrasto no desktop, botões +/−/⤢. Fix do shop lateral cortando no desktop (Iniciar onda sticky). |
| #11 | Gameplay + polish | Prioridade de alvo por torre, prévia da próxima onda, telas de vitória/derrota ricas + compartilhar resultado. Atualização do README e deste backlog. |
| #12 | Refinamento de UI | Fix dos cards da loja cortando no mobile (shop-list não encolhe), prévia da próxima onda compacta (uma linha) e **menu de pausa** (Continuar / Reiniciar fase / Menu principal). |
| #13 | Dificuldade + game feel | Níveis de dificuldade (Fácil/Normal/Difícil: recursos iniciais, HP, recompensa) e feedback de dano no núcleo (tremor de tela + vinheta vermelha + vibração). |
| #14 | Áudio | Controle de volume (slider) e música de fundo sintetizada (pad + arpejo em loop), com toggle. Tudo persistido. |
| #15 | Bestiário | Painel no menu listando os 6 inimigos: ícone, descrição e stats (HP/velocidade/recompensa + traços). |
| #16 | Habilidades ativas | Congelar (lentidão geral) e Tempestade (dano em área), com cooldown e anel de progresso, no canto do mapa. |

## 🔜 Backlog (próximos candidatos)

> Em andamento: puxando os itens abaixo em sequência (PRs #13+).

**Profundidade de jogo**
- [x] ~~Níveis de dificuldade~~ (PR #13).
- [ ] Variedade de mapa: mapas ou caminhos alternativos.
- [x] ~~Habilidades ativas com cooldown~~ (PR #16).

**Áudio / polish**
- [x] ~~Controle de volume + música de fundo~~ (PR #14).
- [x] ~~Feedback de dano no núcleo (flash/shake)~~ (PR #13).
- [x] ~~Bestiário de inimigos~~ (PR #15).

**Plataforma**
- [ ] PWA instalável + offline (manifest + service worker; ícone na home, joga sem rede).

## 🧭 Decisões de design (log)

- **Regressão visual via DOM, não pixel-diff.** Sem container pinado (Docker),
  screenshots variam entre o ambiente local e o `ubuntu-latest` do CI (fontes/
  antialiasing). O *layout guard* (`e2e/tests/layout.spec.js`) valida estrutura
  (elementos visíveis/escondidos, contagens, sem overflow horizontal no mobile),
  que é determinístico e estável.
- **Câmera por transformação, mundo fixo 1280×720.** O canvas preenche o
  playfield (com `devicePixelRatio`); o "encaixe" do mapa virou escala da
  câmera. `zoom ∈ [1,3]`; pan limitado para não revelar fora do mapa.
- **Gestos sem conflito:** 1 dedo = construir/selecionar; 2 dedos = zoom/pan.
- **Mira por distância ao núcleo** (não por progresso no caminho) — trata os
  voadores, que cortam direto, de forma justa. A prioridade de alvo
  (Núcleo/Forte/Fraco/Perto) é um peso por inimigo; escolhe-se o menor no alcance.
- **API de debug (`window.__OVERHEAD`)** expõe hooks determinísticos (build,
  step, snapshot, zoom, etc.) usados só pelos testes e2e — não altera o jogo.

## Como rodar os testes

```bash
cd e2e && npm ci && npx playwright test      # desktop + mobile
```
