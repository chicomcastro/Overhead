# Backlog — Overhead (versão web)

Acompanhamento do que já foi feito, o que está em andamento e o que falta na
remasterização web em [`web/`](web/). Atualize ao concluir cada item.

> Não há issues no GitHub para este projeto; este arquivo é a fonte de verdade
> do backlog. PRs são squash-merge na `master` e o deploy é automático no
> GitHub Pages.

## ✅ Entregue

| PR | Tema | Resumo |
|----|------|--------|
| #6 | Profundidade de endgame | Melhorias globais (ralo de mana), inimigos novos (voador + curandeiro), boss a cada 5 ondas, modo infinito, leaderboard local e persistência de preferências. Fix de mira (voadores). |
| #7 | Toque no mobile | Construir torre por toque (ação no `touchend`, pois `preventDefault` mata o `click`). |
| #8 | Jogabilidade mobile | Alvos de toque maiores, feedback ao construir (✓ + vibração), tutorial de 1ª jogada. + **layout guard** e2e (regressão de layout determinística por DOM, não pixel-diff). |
| #9 | UX/UI mobile | HUD compacto numa linha, painel da torre selecionada (nome/nível/stats/tags), auto-seleção ao construir, fim do overlap loja↔ações. |
| #10 | Câmera | Zoom (1–3×) + pan: pinça/2 dedos no mobile, scroll/arrasto no desktop, botões +/−/⤢. Fix do shop lateral cortando no desktop (Iniciar onda sticky). |
| #11 | Gameplay + polish | Prioridade de alvo por torre, prévia da próxima onda, telas de vitória/derrota ricas + compartilhar resultado. Atualização do README e deste backlog. |
| #12 | Refinamento de UI | Fix dos cards da loja cortando no mobile (shop-list não encolhe), prévia da próxima onda compacta (uma linha) e **menu de pausa** (Continuar / Reiniciar fase / Menu principal). |
| #13 | Dificuldade + game feel | Níveis de dificuldade (Fácil/Normal/Difícil: recursos iniciais, HP, recompensa) e feedback de dano na torre (tremor de tela + vinheta vermelha + vibração). |
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
parede exponencial depois, derrota ~onda 18 mesmo com tabuleiro no talo, e mana
sobrando sem ralo. O HP crescia ~4× mais rápido que o teto de dano.

## 🗺️ Campanha — roadmap

- [x] **Fundação** (PR #24): mapa de fases, estrelas, best por fase, desbloqueio, save.
- [x] **Conteúdo** (PR #25): 6 fases com mecânicas/inimigos crescentes + intros; desbloqueio por estrelas acumuladas.
- [x] **Conteúdo** (PRs #31, #32): 10 fases com mapas multi-entrada, intros narrativos (história do bruxo/princesa) e mecânicas crescentes.
- [x] **Modo Livre** (PR #28): separado da campanha com dificuldade + mapa + infinito.
- [x] **Fase de tutorial** (PR #29 + polish): fase 1 como tutorial, coach passo a passo guiado (reage às ações do jogador).
- [x] **Polish** do mapa: trilha visual entre fases, estrelas animadas (brilho pulsante), 'Próxima fase' direto no resultado.

## 🔜 Backlog (próximos candidatos)

> ✅ Backlog inicial concluído (PRs #13–#18). Novas ideias entram abaixo.

**Profundidade de jogo**
- [x] ~~Níveis de dificuldade~~ (PR #13).
- [x] ~~Variedade de mapa~~ (PR #17): 3 mapas selecionáveis.
- [x] ~~Habilidades ativas com cooldown~~ (PR #16).

**Áudio / polish**
- [x] ~~Controle de volume + música de fundo~~ (PR #14).
- [x] ~~Feedback de dano na torre (flash/shake)~~ (PR #13).
- [x] ~~Bestiário de inimigos~~ (PR #15).

**Plataforma**
- [x] ~~PWA instalável + offline~~ (PR #18).

## 🧭 Decisões de design

Documentadas como ADRs em [`docs/adrs/`](adrs/).

## Como rodar os testes

```bash
cd e2e && npm ci && npx playwright test      # desktop + mobile
```
