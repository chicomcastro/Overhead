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
| #17 | Variedade de mapa | 3 mapas selecionáveis no menu (Serpente, Pente, Ziguezague), cada um com caminho e nós próprios. |
| #18 | PWA | Instalável (manifest + ícone) e jogável offline (service worker cacheia o app shell). |
| #19 | Rebalanceamento | Curva de HP suavizada (1.16→1.14) e diferenciada por dificuldade (hpRamp), teto de dano maior (maxLevel 4→6), globais melhores, inimigos especiais mais cedo. + ferramenta de simulação `e2e/tools` (`npm run balance`). |
| #20 | Lobby mobile | Hierarquia clara no menu: destaque em título → dificuldade → Jogar; mapa/áudio/modo infinito recolhidos em ⚙ Opções e passos em ❓ Como jogar; leaderboard vazio não polui. |
| #21 | Shell nativo (mobile) | Splash de abertura, lobby tela cheia com lista de ações, bottom sheets (Opções/Como jogar/Bestiário/Pausa), safe-area insets, animações e feedback de toque. Só no mobile; desktop intacto. |

## 🎚️ Balanceamento (alvos, PR #19)

Validado com a simulação (`npm run balance`, jogador-robô razoável):
- **Fácil:** vitória confortável (~25 vidas).
- **Normal:** vitória apertada — pressão real só no fim (vaza a partir da onda ~18).
- **Difícil:** o build genérico perde (~onda 17); exige torres diversas + habilidades + globais.

Antes (1.16 / maxLevel 4): curva "plana e depois despenca" — 0 ameaça até ~onda 10,
parede exponencial depois, derrota ~onda 18 mesmo com tabuleiro no talo, e almas
sobrando sem ralo. O HP crescia ~4× mais rápido que o teto de dano.

## 🔜 Backlog (próximos candidatos)

> ✅ Backlog inicial concluído (PRs #13–#18). Novas ideias entram abaixo.

**Profundidade de jogo**
- [x] ~~Níveis de dificuldade~~ (PR #13).
- [x] ~~Variedade de mapa~~ (PR #17): 3 mapas selecionáveis.
- [x] ~~Habilidades ativas com cooldown~~ (PR #16).

**Áudio / polish**
- [x] ~~Controle de volume + música de fundo~~ (PR #14).
- [x] ~~Feedback de dano no núcleo (flash/shake)~~ (PR #13).
- [x] ~~Bestiário de inimigos~~ (PR #15).

**Plataforma**
- [x] ~~PWA instalável + offline~~ (PR #18).

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
