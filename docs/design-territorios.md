# Design Doc — Territórios e Expansão de Conteúdo

## Visão geral

Expandir o jogo com **territórios** — cada um é uma campanha de ~10 fases com
tema visual, paleta de cores, inimigos exclusivos, uma torre nova desbloqueável
e mecânicas que mudam a forma de jogar. O jogador avança território a território,
desbloqueando o próximo ao acumular estrelas suficientes.

---

## Territórios propostos

### 1. O Reino (atual)

**Tema:** Castelo medieval, campo aberto.  
**Paleta:** Azul escuro, ciano, roxo.  
**Narrativa:** O Bruxo sequestrou a princesa. O exército do reino avança para
resgatá-la.

**Inimigos:**
| Nome | Tipo | Mecânica |
|------|------|----------|
| Soldado | grunt | Comum, equilibrado |
| Batedor | fast | Frágil, muito veloz |
| Cavaleiro | tank | Blindado, lento |
| Grifo | flyer | Voa reto à Torre, ignora caminho |
| Clérigo | healer | Cura aliados próximos |
| Paladino | boss | Colossal, a cada 5 ondas |

**Torres:** Esfera Arcana, Gélida, Fatal, Ígnea.

---

### 2. A Floresta Sombria

**Tema:** Floresta encantada, densa e traiçoeira. Árvores retorcidas, neblina.  
**Paleta:** Verde escuro, roxo, dourado.  
**Narrativa:** O Bruxo recuou para a Floresta Sombria. Druidas e criaturas da
mata tentam expulsá-lo e libertar a princesa.

**Inimigos novos:**
| Nome | Tipo | Mecânica |
|------|------|----------|
| Raiz | grunt | Comum da floresta, mais HP que Soldado |
| Lobo | fast | Muito veloz, ataca em matilha (spawna em grupos de 3) |
| Ent | tank | Colossal, regenera HP lentamente |
| Coruja | flyer | Voa, invisível até entrar no alcance de uma torre |
| Druida | healer | Cura e aplica escudo temporário (absorve 1 hit) |
| Senhor da Mata | boss | Invoca Raízes extras ao tomar dano |

**Torre nova — Esfera Venenosa:**
- Dano médio + **veneno** (DoT que acumula, sem limite de stacks).
- Boa contra tanks com regeneração (Ent).
- Cor: verde ácido.

**Mecânica do território — Neblina:**
- Alguns trechos do caminho ficam cobertos por neblina (visualmente escurecidos).
- Torres não miram inimigos dentro da neblina.
- O jogador precisa posicionar torres estrategicamente nos trechos visíveis.

---

### 3. O Vulcão

**Tema:** Montanha vulcânica, rios de lava, rocha negra.  
**Paleta:** Vermelho, laranja, preto.  
**Narrativa:** O Bruxo foge para as profundezas do vulcão. Demônios e
elementais de fogo perseguem a princesa pelo calor infernal.

**Inimigos novos:**
| Nome | Tipo | Mecânica |
|------|------|----------|
| Imp | grunt | Comum, resistente a queimadura (burn) |
| Salamandra | fast | Veloz, deixa rastro de fogo (dano em torres próximas ao caminho) |
| Golem | tank | Enorme, imune a slow/freeze |
| Fênix | flyer | Ao morrer, renasce com 50% HP uma vez |
| Xamã | healer | Cura e dá buff de velocidade temporário |
| Senhor das Chamas | boss | Aura de calor que reduz o alcance de torres próximas |

**Torre nova — Esfera de Gelo Profundo:**
- Dano baixo, mas **congela** (stun completo por 1s, cooldown longo).
- Essencial contra inimigos imunes a slow.
- Cor: azul gelo.

**Mecânica do território — Erupção:**
- A cada X ondas, erupção vulcânica causa dano aleatório em 1-2 torres.
- O jogador precisa diversificar posições (não agrupar tudo).

---

### 4. O Oceano

**Tema:** Fortaleza costeira, tempestade, ondas quebrando.  
**Paleta:** Azul marinho, turquesa, branco.  
**Narrativa:** A perseguição leva ao litoral. Piratas e criaturas marinhas
atacam a fortaleza do Bruxo pela costa.

**Inimigos novos:**
| Nome | Tipo | Mecânica |
|------|------|----------|
| Marinheiro | grunt | Comum, velocidade aumenta quando molhado (chuva) |
| Sereia | fast | Veloz, encanta 1 torre próxima (desativa por 3s ao passar) |
| Caranguejo | tank | Blindado, reflete parte do dano de volta na torre |
| Gaivota | flyer | Voa em bando (spawn de 4, cada um fraco) |
| Médica Naval | healer | Cura e remove efeitos negativos (slow, veneno, burn) |
| Kraken | boss | Tentáculos bloqueiam 2 nós temporariamente a cada fase |

**Torre nova — Esfera de Raio:**
- Dano em cadeia: atinge o alvo principal e **salta** para até 2 inimigos
  próximos (50% do dano no salto).
- Excelente contra bandos (Gaivota, Lobo).
- Cor: amarelo elétrico.

**Mecânica do território — Maré:**
- Maré sobe e desce ciclicamente (a cada 3 ondas).
- Quando a maré está alta, alguns nós ficam submersos (não podem ter torres).
- Torres nesses nós são temporariamente desativadas, não destruídas.

---

## Progressão entre territórios

```
O Reino (30★ max) → A Floresta (30★) → O Vulcão (30★) → O Oceano (30★)
                                                         Total: 120★
```

- Cada território desbloqueia com **X estrelas totais** do anterior
  (ex: Floresta requer 15★ do Reino = ~metade).
- A torre nova de cada território fica disponível em **todos os modos**
  uma vez desbloqueada (Modo Livre e territórios anteriores também ganham).
- O bestiário cresce: inimigos de territórios anteriores podem aparecer em
  fases tardias dos novos (ex: Cavaleiro na Floresta fase 8).

---

## Redesign do Mapa de Fases

O mapa atual é uma lista vertical de cards retangulares — funcional mas não
lúdico. A proposta é transformá-lo num **mapa visual por território**.

### Layout

- **Tela cheia** (não modal) com scroll horizontal entre territórios.
- Cada território é uma "página" com grid de fases distribuídas num cenário
  ilustrado (não uma lista linear).
- Fases como **nós circulares** conectados por uma trilha estilizada
  (caminho de terra no Reino, raízes na Floresta, lava no Vulcão, ondas no
  Oceano).
- Trilha entre fases animada (partículas fluindo na direção da progressão).

### Visual por fase

- **Bloqueada:** nó cinza com cadeado, sem ilustração.
- **Desbloqueada:** nó colorido (cor do território), ícone/emoji da mecânica
  principal da fase (ex: 🦅 para a fase dos Grifos, 🛡 para Cavaleiros).
- **Completada:** estrelas animadas (shimmer) em volta do nó.
- **3 estrelas:** efeito especial (brilho dourado permanente, mini-coroa).
- **Fase atual:** pulso + seta indicando "próxima".

### Navegação

- Swipe horizontal entre territórios (ou tabs no topo: "Reino", "Floresta"...).
- Tap no nó abre o intro da fase (já existente, mas agora sobreposto ao mapa).
- Território bloqueado aparece em silhueta com "Requer X★" centralizado.

### Animações

- Ao desbloquear uma fase: nó "acende" com explosão de partículas.
- Ao completar: estrelas caem no nó uma a uma.
- Transição entre territórios: slide com parallax (cenário de fundo move mais
  devagar que os nós).

---

## Priorização sugerida

| Fase | Escopo | Estimativa |
|------|--------|------------|
| 1 | Redesign do mapa de fases (grid visual + animações) | Grande |
| 2 | Território "Floresta Sombria" (inimigos + torre + mecânica + 10 fases) | Grande |
| 3 | Território "Vulcão" | Grande |
| 4 | Território "Oceano" | Grande |

Cada território pode ser um PR independente. O redesign do mapa é pré-requisito
para suportar múltiplos territórios visualmente.

---

## Decisões em aberto

1. **Quantas fases por território?** 10 (atual) ou reduzir para 8 e ter mais
   territórios?
2. **Inimigos cross-território:** aparecem misturados nas fases tardias ou cada
   território é isolado?
3. **Dificuldade no Modo Livre:** se aplica aos territórios novos ou só ao
   primeiro?
4. **Meta-progression:** estrelas de todos os territórios somam num total global
   ou cada um tem contador separado?
5. **Visual do mapa:** ilustrações via emoji/CSS (viável agora) ou SVGs custom
   (requer assets)?
