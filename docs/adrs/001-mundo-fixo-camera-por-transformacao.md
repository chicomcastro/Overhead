# ADR-001: Câmera por transformação, mundo fixo 1280x720

**Data:** 2026-05-30  
**Status:** Aceita  
**PR:** #1 (versão web inicial)

## Contexto

A versão web precisa rodar em qualquer resolução (desktop e mobile) sem distorcer o mapa ou a jogabilidade. A abordagem clássica de redesenhar o mundo em coordenadas relativas seria complexa e frágil.

## Decisão

O mundo do jogo é sempre 1280x720 em coordenadas lógicas. O canvas preenche o playfield usando `devicePixelRatio` para nitidez. O "encaixe" do mapa é feito via escala da câmera (`zoom` entre 1 e 3), com pan limitado para não revelar área fora do mapa.

## Consequências

- Simplifica toda a lógica de posição: inimigos, torres, projéteis e nós trabalham em coordenadas absolutas fixas.
- Zoom e pan são transformações visuais, não afetam a simulação.
- Mapas novos precisam caber no espaço 1280x720.
