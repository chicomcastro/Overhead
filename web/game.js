/* =====================================================================
 * OVERHEAD — Web Edition
 * Remake web do tower defense originalmente feito em Unity.
 *
 * Mecânicas fiéis ao original:
 *   - Torre Mestra (core) central com vidas; inimigos que chegam atacam.
 *   - "Mana" como moeda: derrotar inimigos rende mana; torres custam mana.
 *   - Ondas com dificuldade escalante (HP e velocidade x constante por onda).
 *   - Torres (esferas) miram automaticamente e disparam projéteis teleguiados.
 *   - Efeitos especiais: slow/freeze, fatal hit (crit instantâneo),
 *     bônus de mana, dano em área e queimadura (burn DoT).
 * ===================================================================== */

(() => {
  "use strict";

  // ----- Design resolution (world space) -----
  const W = 1280, H = 720;

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // ===================================================================
  //  CONFIG — espelha as constantes do WaveSpawner / SoulsCounter Unity
  // ===================================================================
  const CONFIG = {
    initialMana: 40,
    initialLives: 20,
    baseHP: 58,            // baseHPConst
    baseSpeed: 54,         // px/s (baseSpeedConst escalado p/ tela)
    hpWaveConst: 1.14,     // rampa de HP por onda (suavizada p/ a curva não explodir)
    speedWaveConst: 1.05,  // SpeedWaveConst
    timeBetweenWaves: 6,   // s
    spawnDelay: 0.6,       // s entre inimigos
    totalWaves: 20,
    // ----- Upgrades (skill tree do original, simplificado por torre) -----
    maxLevel: 6,           // nível 1 (base) -> 6; teto de dano + ralo de mana
    upgradeCostMul: 1.6,   // custo do próx. nível = base * mul^nível
    lvlDamageMul: 1.4,     // +40% dano por nível
    lvlRangeMul: 1.12,     // +12% alcance por nível
    lvlCooldownMul: 0.88,  // -12% recarga por nível
    // ----- Melhorias globais (ralo de mana do endgame, sem teto) -----
    globalDmgStep: 0.07,   // +7% dano por nível de Foco Arcano
    globalRngStep: 0.06,   // +6% alcance por nível de Lentes Rúnicas
  };

  // Níveis de dificuldade — afetam recursos iniciais, HP dos inimigos e recompensa.
  // hpMul = HP base por dificuldade; hpRamp = quão rápido o HP cresce por onda
  // (escala o expoente da rampa) — diferencia a CURVA, não só os recursos.
  const DIFFICULTIES = {
    easy:   { label: "Fácil",   mana: 50, lives: 25, hpMul: 0.90, hpRamp: 0.82, rewardMul: 1.15 },
    normal: { label: "Normal",  mana: 40, lives: 20, hpMul: 1.0,  hpRamp: 1.0,  rewardMul: 1.0 },
    hard:   { label: "Difícil", mana: 30, lives: 15, hpMul: 1.10, hpRamp: 1.22, rewardMul: 0.9 },
  };
  const DIFFICULTY_ORDER = ["easy", "normal", "hard"];
  const diffCfg = () => DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;

  // Habilidades ativas (cooldown global, sem custo de mana).
  const ABILITIES = {
    freeze: { icon: "❄", name: "Congelar", cd: 24, dur: 3.5, factor: 0.15 },          // congela todos
    storm:  { icon: "⚡", name: "Tempestade", cd: 34, dmgPct: 0.32, dmgFlat: 30 },     // dano em área
  };
  const ABILITY_ORDER = ["freeze", "storm"];

  // ===================================================================
  //  TERRITÓRIOS — cada um agrupa mapas, fases, inimigos e torre nova.
  //  O Reino é o território inicial; os demais desbloqueiam com 25★.
  // ===================================================================
  const TERRITORIES = [
    {
      id: "reino", name: "O Reino", color: "#6ee7ff", unlockStars: 0,
      maps: [
        {
          id: "serpent", name: "Serpente",
          paths: [[
            { x: -40, y: 140 }, { x: 300, y: 140 }, { x: 300, y: 420 },
            { x: 620, y: 420 }, { x: 620, y: 160 }, { x: 900, y: 160 },
            { x: 900, y: 560 }, { x: 640, y: 560 },
          ]],
          nodes: [
            { x: 180, y: 280 }, { x: 430, y: 280 }, { x: 460, y: 540 },
            { x: 470, y: 300 }, { x: 760, y: 300 }, { x: 780, y: 420 },
            { x: 1040, y: 320 }, { x: 760, y: 660 }, { x: 1050, y: 600 },
            { x: 180, y: 30 }, { x: 500, y: 60 }, { x: 1050, y: 80 },
          ],
        },
        {
          id: "comb", name: "Pente",
          paths: [[
            { x: -40, y: 120 }, { x: 1120, y: 120 }, { x: 1120, y: 330 },
            { x: 160, y: 330 }, { x: 160, y: 540 }, { x: 1120, y: 540 },
          ]],
          nodes: [
            { x: 160, y: 225 }, { x: 380, y: 225 }, { x: 600, y: 225 }, { x: 820, y: 225 }, { x: 1040, y: 225 },
            { x: 380, y: 435 }, { x: 600, y: 435 }, { x: 820, y: 435 }, { x: 1040, y: 435 },
            { x: 380, y: 645 }, { x: 600, y: 645 }, { x: 820, y: 645 },
          ],
        },
        {
          id: "ziggy", name: "Ziguezague",
          paths: [[
            { x: -40, y: 150 }, { x: 280, y: 150 }, { x: 280, y: 470 },
            { x: 560, y: 470 }, { x: 560, y: 150 }, { x: 840, y: 150 },
            { x: 840, y: 470 }, { x: 1100, y: 470 }, { x: 1100, y: 250 }, { x: 760, y: 250 },
          ]],
          nodes: [
            { x: 120, y: 310 }, { x: 420, y: 150 }, { x: 420, y: 320 }, { x: 700, y: 320 },
            { x: 700, y: 470 }, { x: 970, y: 150 }, { x: 970, y: 360 }, { x: 120, y: 480 },
            { x: 120, y: 630 }, { x: 420, y: 630 }, { x: 700, y: 630 }, { x: 970, y: 630 },
          ],
        },
        {
          id: "fork", name: "Bifurcação",
          paths: [
            [ { x: -40, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 400 }, { x: 660, y: 400 }, { x: 660, y: 580 } ],
            [ { x: 980, y: -40 }, { x: 980, y: 400 }, { x: 660, y: 400 }, { x: 660, y: 580 } ],
          ],
          nodes: [
            { x: 560, y: 470 }, { x: 760, y: 470 }, { x: 560, y: 580 }, { x: 760, y: 580 },
            { x: 460, y: 300 }, { x: 800, y: 280 }, { x: 260, y: 300 }, { x: 980, y: 280 },
            { x: 140, y: 300 }, { x: 1120, y: 300 }, { x: 660, y: 260 }, { x: 900, y: 540 },
          ],
        },
        {
          id: "cross", name: "Cruzamento",
          paths: [
            [ { x: -40, y: 180 }, { x: 440, y: 180 }, { x: 440, y: 360 }, { x: 640, y: 360 }, { x: 640, y: 620 } ],
            [ { x: 1320, y: 180 }, { x: 840, y: 180 }, { x: 840, y: 360 }, { x: 640, y: 360 }, { x: 640, y: 620 } ],
          ],
          nodes: [
            { x: 540, y: 460 }, { x: 740, y: 460 }, { x: 540, y: 580 }, { x: 740, y: 580 },
            { x: 300, y: 180 }, { x: 980, y: 180 }, { x: 300, y: 360 }, { x: 980, y: 360 },
            { x: 440, y: 500 }, { x: 840, y: 500 }, { x: 640, y: 260 }, { x: 1120, y: 360 },
          ],
        },
        {
          id: "gates", name: "Portões",
          paths: [
            [ { x: 500, y: -40 }, { x: 500, y: 360 }, { x: 1120, y: 360 } ],
            [ { x: 500, y: 760 }, { x: 500, y: 360 }, { x: 1120, y: 360 } ],
          ],
          nodes: [
            { x: 640, y: 280 }, { x: 640, y: 440 }, { x: 820, y: 280 }, { x: 820, y: 440 },
            { x: 960, y: 280 }, { x: 960, y: 440 }, { x: 360, y: 300 }, { x: 360, y: 440 },
            { x: 500, y: 180 }, { x: 500, y: 540 }, { x: 180, y: 360 }, { x: 1040, y: 200 },
          ],
        },
        {
          id: "delta", name: "Delta",
          paths: [
            [ { x: 220, y: -40 }, { x: 220, y: 440 }, { x: 640, y: 440 }, { x: 640, y: 640 } ],
            [ { x: 1060, y: -40 }, { x: 1060, y: 440 }, { x: 640, y: 440 }, { x: 640, y: 640 } ],
            [ { x: 640, y: -40 }, { x: 640, y: 640 } ],
          ],
          nodes: [
            { x: 540, y: 520 }, { x: 740, y: 520 }, { x: 540, y: 620 }, { x: 740, y: 620 },
            { x: 420, y: 440 }, { x: 860, y: 440 }, { x: 220, y: 300 }, { x: 1060, y: 300 },
            { x: 120, y: 500 }, { x: 1160, y: 500 }, { x: 400, y: 640 }, { x: 880, y: 640 },
          ],
        },
        {
          id: "horseshoe", name: "Ferradura",
          paths: [[
            { x: -40, y: 120 }, { x: 1120, y: 120 }, { x: 1120, y: 600 },
            { x: 160, y: 600 }, { x: 160, y: 360 }, { x: 640, y: 360 },
          ]],
          nodes: [
            { x: 200, y: 240 }, { x: 460, y: 240 }, { x: 720, y: 240 }, { x: 980, y: 240 },
            { x: 1000, y: 420 }, { x: 460, y: 470 }, { x: 720, y: 470 }, { x: 300, y: 260 },
            { x: 500, y: 690 }, { x: 780, y: 690 }, { x: 1040, y: 690 }, { x: 640, y: 480 },
          ],
        },
        {
          id: "chambers", name: "Câmaras",
          paths: [[
            { x: -40, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 300 }, { x: 200, y: 300 },
            { x: 200, y: 500 }, { x: 820, y: 500 }, { x: 820, y: 250 }, { x: 1120, y: 250 },
            { x: 1120, y: 620 }, { x: 600, y: 620 },
          ]],
          nodes: [
            { x: 180, y: 200 }, { x: 700, y: 200 }, { x: 350, y: 200 }, { x: 350, y: 400 },
            { x: 1000, y: 150 }, { x: 1000, y: 400 }, { x: 660, y: 400 }, { x: 980, y: 560 },
            { x: 660, y: 560 }, { x: 400, y: 620 }, { x: 200, y: 620 }, { x: 1180, y: 450 },
          ],
        },
        {
          id: "spiral", name: "Espiral",
          paths: [[
            { x: -40, y: 60 }, { x: 1180, y: 60 }, { x: 1180, y: 660 }, { x: 120, y: 660 },
            { x: 120, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 520 }, { x: 420, y: 520 },
            { x: 420, y: 360 }, { x: 620, y: 360 },
          ]],
          nodes: [
            { x: 300, y: 130 }, { x: 600, y: 130 }, { x: 900, y: 130 }, { x: 50, y: 400 },
            { x: 1060, y: 400 }, { x: 300, y: 590 }, { x: 660, y: 590 }, { x: 1040, y: 590 },
            { x: 620, y: 260 }, { x: 760, y: 360 }, { x: 300, y: 360 }, { x: 990, y: 300 },
          ],
        },
      ],
      enemies: {
        grunt: { name: "Soldado", icon: "⚔️", hpMul: 1.0, speedMul: 1.0, reward: 4, color: "#cdd6f4", radius: 13,
                 desc: "Soldado comum do reino. Aparece desde a 1ª onda." },
        fast:  { name: "Batedor", icon: "💨", hpMul: 0.6, speedMul: 1.7, reward: 5, color: "#a6e3a1", radius: 11,
                 desc: "Frágil, mas muito veloz. Bom alvo para torres de lentidão." },
        tank:  { name: "Cavaleiro", icon: "🛡️", hpMul: 3.2, speedMul: 0.6, reward: 9, color: "#f38ba8", radius: 19,
                 desc: "Blindado e resistente. Exige dano concentrado para derrubar." },
        flyer: { name: "Grifo", icon: "🦅", hpMul: 0.85, speedMul: 1.15, reward: 6, color: "#89dceb", radius: 12, flying: true,
                 desc: "Voa em linha reta até a Torre, ignorando o caminho." },
        healer:{ name: "Clérigo", icon: "✚", hpMul: 1.7, speedMul: 0.8, reward: 8, color: "#94e2d5", radius: 15, heal: 22, healRange: 95, healInterval: 1.1,
                 desc: "Cura aliados próximos periodicamente. Elimine-o primeiro." },
        boss:  { name: "Paladino", icon: "👑", hpMul: 14, speedMul: 0.5, reward: 40, color: "#f9e2af", radius: 26,
                 desc: "Líder sagrado a cada 5 ondas. Recompensa generosa." },
      },
      levels: [
        { id: 1, name: "Despertar",     mapId: "serpent",   waves: 5,  enemies: [], boss: false, hp: 0.9,
          par: 120, reqStars: 0, tutorial: true,
          intro: "O reino descobriu onde a princesa está presa. Os primeiros soldados marcham até sua Torre. Erga esferas nos nós azuis e segure a linha." },
        { id: 2, name: "Sussurros",     mapId: "comb",      waves: 6,  enemies: ["fast"], boss: false, hp: 1.0,
          par: 130, reqStars: 2,
          intro: "Rumores da princesa se espalham. Batedores velozes exploram os arredores — a Esfera Gélida congela quem ousar se aproximar." },
        { id: 3, name: "Encruzilhada",  mapId: "ziggy",     waves: 7,  enemies: ["fast", "tank"], boss: false, hp: 1.0,
          par: 330, reqStars: 4,
          intro: "O rei enviou seus Cavaleiros blindados. Eles sobem o ziguezague lentamente, mas resistem a quase tudo. Concentre fogo." },
        { id: 4, name: "Duas Frentes",  mapId: "fork",      waves: 8,  enemies: ["fast", "tank"], boss: false, hp: 1.0,
          par: 225, reqStars: 6,
          intro: "O general dividiu suas tropas — os invasores vêm por DUAS frentes ao mesmo tempo. Defenda os dois caminhos." },
        { id: 5, name: "Céus Sombrios", mapId: "horseshoe", waves: 8,  enemies: ["fast", "tank", "flyer"], boss: false, hp: 1.05,
          par: 245, reqStars: 8,
          intro: "A cavalaria aérea chegou. Grifos cortam reto à sua Torre, ignorando o caminho. Cubra o ar ou será tarde demais." },
        { id: 6, name: "O Cerco",       mapId: "cross",     waves: 9,  enemies: ["fast", "tank", "flyer"], boss: false, hp: 1.05,
          par: 285, reqStars: 10,
          intro: "O exército real cerca a Torre por todos os lados. Cerco total — esquerda e direita avançam juntas." },
        { id: 7, name: "Procissão",     mapId: "chambers",  waves: 9,  enemies: ["fast", "tank", "flyer", "healer"], boss: false, hp: 1.1,
          par: 345, reqStars: 12,
          intro: "A Igreja enviou seus Clérigos para curar os feridos em campo. Elimine-os primeiro ou as tropas nunca cairão." },
        { id: 8, name: "Portões",       mapId: "gates",     waves: 10, enemies: ["fast", "tank", "flyer", "healer"], boss: false, hp: 1.05,
          par: 230, reqStars: 14,
          intro: "Dois portões — um pelo céu, um por terra — despejam ondas de invasores sobre a Torre. Divida sua atenção." },
        { id: 9, name: "Espiral",       mapId: "spiral",    waves: 11, enemies: ["fast", "tank", "flyer", "healer"], boss: false, hp: 1.2,
          par: 615, reqStars: 16,
          intro: "O exército se reúne para o ataque final. A espiral os traz devagar, mas em peso. Monte sua defesa em camadas." },
        { id: 10, name: "O Paladino",   mapId: "delta",     waves: 12, enemies: ["fast", "tank", "flyer", "healer"], boss: true, hp: 1.1,
          par: 355, reqStars: 18,
          intro: "O Paladino Sagrado lidera o assalto final por TRÊS frentes. Ele ressurge a cada 5 ondas. Se a Torre cair, a princesa será libertada." },
      ],
      towerUnlock: null,
      mechanic: null,
    },
    // ==================== A FLORESTA SOMBRIA ====================
    {
      id: "floresta", name: "A Floresta Sombria", color: "#a6e3a1", unlockStars: 25,
      maps: [
        { id: "f-trilha", name: "Trilha", paths: [[ {x:-40,y:360}, {x:300,y:360}, {x:300,y:160}, {x:640,y:160}, {x:640,y:560}, {x:1000,y:560} ]], nodes: [ {x:160,y:260}, {x:440,y:160}, {x:440,y:360}, {x:480,y:560}, {x:800,y:360}, {x:800,y:560}, {x:160,y:500}, {x:640,y:360}, {x:1040,y:400}, {x:160,y:100}, {x:1040,y:200}, {x:1040,y:660} ] },
        { id: "f-clareira", name: "Clareira", paths: [[ {x:640,y:-40}, {x:640,y:200}, {x:300,y:200}, {x:300,y:500}, {x:640,y:500}, {x:640,y:700} ]], nodes: [ {x:480,y:200}, {x:480,y:350}, {x:480,y:500}, {x:800,y:200}, {x:800,y:350}, {x:800,y:500}, {x:160,y:350}, {x:1000,y:350}, {x:300,y:350}, {x:640,y:350}, {x:160,y:150}, {x:1000,y:150} ] },
        { id: "f-raizes", name: "Raízes", paths: [[ {x:-40,y:100}, {x:400,y:100}, {x:400,y:360}, {x:880,y:360}, {x:880,y:600}, {x:600,y:600} ]], nodes: [ {x:200,y:220}, {x:400,y:220}, {x:600,y:220}, {x:600,y:360}, {x:600,y:500}, {x:880,y:200}, {x:740,y:600}, {x:1040,y:460}, {x:200,y:420}, {x:200,y:600}, {x:1040,y:600}, {x:400,y:500} ] },
        { id: "f-neblina", name: "Neblina", paths: [ [{x:-40,y:200}, {x:400,y:200}, {x:400,y:500}, {x:800,y:500}, {x:800,y:300}], [{x:1320,y:200}, {x:900,y:200}, {x:900,y:500}, {x:800,y:500}, {x:800,y:300}] ], nodes: [ {x:200,y:300}, {x:400,y:350}, {x:600,y:350}, {x:600,y:500}, {x:1060,y:300}, {x:1060,y:500}, {x:200,y:500}, {x:800,y:160}, {x:660,y:200}, {x:200,y:100}, {x:1060,y:100}, {x:960,y:660} ] },
        { id: "f-covil", name: "Covil", paths: [[ {x:-40,y:600}, {x:300,y:600}, {x:300,y:300}, {x:640,y:300}, {x:640,y:100}, {x:1000,y:100}, {x:1000,y:500}, {x:700,y:500} ]], nodes: [ {x:160,y:450}, {x:450,y:300}, {x:450,y:100}, {x:820,y:100}, {x:820,y:300}, {x:1140,y:300}, {x:850,y:500}, {x:160,y:200}, {x:640,y:500}, {x:300,y:100}, {x:1140,y:100}, {x:1140,y:600} ] },
        { id: "f-pantano", name: "Pântano", paths: [ [{x:200,y:-40}, {x:200,y:360}, {x:640,y:360}, {x:640,y:660}], [{x:1080,y:-40}, {x:1080,y:360}, {x:640,y:360}, {x:640,y:660}] ], nodes: [ {x:400,y:200}, {x:400,y:500}, {x:880,y:200}, {x:880,y:500}, {x:640,y:200}, {x:640,y:500}, {x:200,y:500}, {x:1080,y:500}, {x:60,y:360}, {x:1200,y:360}, {x:400,y:660}, {x:880,y:660} ] },
        { id: "f-ruinas", name: "Ruínas", paths: [[ {x:-40,y:360}, {x:200,y:360}, {x:200,y:100}, {x:640,y:100}, {x:640,y:600}, {x:1080,y:600}, {x:1080,y:360} ]], nodes: [ {x:80,y:230}, {x:420,y:100}, {x:420,y:350}, {x:640,y:350}, {x:860,y:350}, {x:860,y:600}, {x:1080,y:480}, {x:200,y:560}, {x:640,y:700}, {x:1200,y:250}, {x:200,y:680}, {x:1080,y:200} ] },
        { id: "f-arvoredo", name: "Arvoredo", paths: [[ {x:640,y:-40}, {x:640,y:160}, {x:200,y:160}, {x:200,y:500}, {x:1080,y:500}, {x:1080,y:160}, {x:640,y:160}, {x:640,y:360} ]], nodes: [ {x:420,y:160}, {x:420,y:330}, {x:420,y:500}, {x:860,y:160}, {x:860,y:330}, {x:860,y:500}, {x:200,y:330}, {x:1080,y:330}, {x:640,y:500}, {x:60,y:500}, {x:1200,y:500}, {x:640,y:660} ] },
        { id: "f-gruta", name: "Gruta", paths: [ [{x:-40,y:150}, {x:400,y:150}, {x:400,y:400}, {x:800,y:400}, {x:800,y:650}], [{x:-40,y:550}, {x:400,y:550}, {x:400,y:400}, {x:800,y:400}, {x:800,y:650}] ], nodes: [ {x:200,y:280}, {x:600,y:280}, {x:600,y:520}, {x:200,y:680}, {x:960,y:400}, {x:960,y:560}, {x:400,y:680}, {x:1100,y:280}, {x:1100,y:520}, {x:200,y:50}, {x:600,y:50}, {x:1100,y:680} ] },
        { id: "f-trono", name: "Trono da Mata", paths: [ [{x:-40,y:100}, {x:300,y:100}, {x:300,y:400}, {x:640,y:400}, {x:640,y:650}], [{x:1320,y:100}, {x:980,y:100}, {x:980,y:400}, {x:640,y:400}, {x:640,y:650}], [{x:640,y:-40}, {x:640,y:650}] ], nodes: [ {x:160,y:250}, {x:480,y:250}, {x:480,y:540}, {x:800,y:250}, {x:800,y:540}, {x:1120,y:250}, {x:640,y:250}, {x:300,y:560}, {x:980,y:560}, {x:160,y:500}, {x:1120,y:500}, {x:640,y:540} ] },
      ],
      enemies: {
        f_grunt:  { name: "Raiz",     icon: "🌿", hpMul: 1.0, speedMul: 0.95, reward: 5, color: "#6b8e23", radius: 14, desc: "Raiz animada da floresta. Mais resistente que um soldado comum." },
        f_fast:   { name: "Lobo",     icon: "🐺", hpMul: 0.55, speedMul: 1.65, reward: 6, color: "#a0a0a0", radius: 11, desc: "Ataca em matilha e dispara corridas repentinas." },
        f_tank:   { name: "Ent",      icon: "🌳", hpMul: 2.8, speedMul: 0.5, reward: 11, color: "#556b2f", radius: 22, regen: 2, desc: "Colossal e regenera vida lentamente. Veneno neutraliza a cura." },
        f_flyer:  { name: "Coruja",   icon: "🦉", hpMul: 0.65, speedMul: 1.15, reward: 6, color: "#d2b48c", radius: 12, flying: true, desc: "Voa invisível até entrar no alcance de uma torre." },
        f_healer: { name: "Druida",   icon: "🍃", hpMul: 1.6, speedMul: 0.75, reward: 10, color: "#228b22", radius: 16, heal: 15, healRange: 100, healInterval: 1.4, desc: "Cura aliados e aplica escudo temporário." },
        f_boss:   { name: "Senhor da Mata", icon: "🌲", hpMul: 12, speedMul: 0.45, reward: 50, color: "#2e8b57", radius: 28, desc: "Invoca Raízes extras ao tomar dano. Derrote-o antes que a floresta o engula." },
      },
      levels: [
        { id: 1, name: "Entrada da Mata", mapId: "f-trilha", waves: 5, enemies: [], boss: false, hp: 0.9, par: 120, reqStars: 0, intro: "A floresta escurece ao seu redor. As primeiras raízes animadas se erguem do chão, guardando o caminho." },
        { id: 2, name: "Uivos", mapId: "f-clareira", waves: 6, enemies: ["f_fast"], boss: false, hp: 1.0, par: 135, reqStars: 2, intro: "Lobos selvagens surgem entre as árvores. Velozes e implacáveis — congele-os antes que passem." },
        { id: 3, name: "Raízes Profundas", mapId: "f-raizes", waves: 7, enemies: ["f_fast", "f_tank"], boss: false, hp: 1.0, par: 340, reqStars: 4, intro: "Ents ancestrais despertam. Seus corpos regeneram — o veneno é sua única fraqueza." },
        { id: 4, name: "Emboscada", mapId: "f-neblina", waves: 8, enemies: ["f_fast", "f_tank"], boss: false, hp: 0.9, par: 260, reqStars: 6, intro: "A neblina cobre dois caminhos. Os druidas preparam uma emboscada — defenda ambos os flancos." },
        { id: 5, name: "Voo Noturno", mapId: "f-covil", waves: 8, enemies: ["f_fast", "f_tank", "f_flyer"], boss: false, hp: 1.05, par: 250, reqStars: 8, intro: "Corujas cortam o céu em silêncio. Invisíveis até se revelarem — cubra toda a clareira." },
        { id: 6, name: "Cerco Verde", mapId: "f-pantano", waves: 9, enemies: ["f_fast", "f_tank", "f_flyer"], boss: false, hp: 0.85, par: 310, reqStars: 10, intro: "O pântano fervilha com criaturas vindas de dois lados. Posicione suas esferas com cuidado." },
        { id: 7, name: "Ritual", mapId: "f-ruinas", waves: 9, enemies: ["f_fast", "f_tank", "f_flyer", "f_healer"], boss: false, hp: 1.1, par: 350, reqStars: 12, intro: "Druidas emergem das ruínas, curando tudo ao redor. Elimine-os primeiro ou a floresta nunca cairá." },
        { id: 8, name: "Arvoredo", mapId: "f-arvoredo", waves: 10, enemies: ["f_fast", "f_tank", "f_flyer", "f_healer"], boss: false, hp: 0.9, par: 280, reqStars: 14, intro: "O arvoredo forma um labirinto vivo. Ondas convergem em espiral — defesa em camadas é vital." },
        { id: 9, name: "Gruta Secreta", mapId: "f-gruta", waves: 11, enemies: ["f_fast", "f_tank", "f_flyer", "f_healer"], boss: false, hp: 1.1, par: 620, reqStars: 16, intro: "Duas entradas na gruta despejam hordas. Monte uma defesa sólida no corredor central." },
        { id: 10, name: "O Senhor da Mata", mapId: "f-trono", waves: 12, enemies: ["f_fast", "f_tank", "f_flyer", "f_healer"], boss: true, hp: 0.9, par: 400, reqStars: 18, intro: "O Senhor da Mata desperta em seu trono. Três caminhos convergem — ele invoca raízes a cada golpe. Esta é a última defesa." },
      ],
      towerUnlock: { id: "poison", name: "Esfera Venenosa", color: "#50fa7b", cost: 28,
        damage: 14, range: 140, cooldown: 0.9, projSpeed: 480,
        desc: "Veneno acumulável que corrói a vida do alvo.",
        poison: 6, poisonDur: 4 },
      mechanic: "fog",
    },
    // ==================== O VULCÃO ====================
    {
      id: "vulcao", name: "O Vulcão", color: "#ff6b81", unlockStars: 25,
      maps: [
        { id: "v-cratera", name: "Cratera", paths: [[ {x:-40,y:360}, {x:300,y:360}, {x:300,y:120}, {x:700,y:120}, {x:700,y:600}, {x:1000,y:600} ]], nodes: [ {x:160,y:240}, {x:500,y:120}, {x:500,y:360}, {x:500,y:600}, {x:860,y:360}, {x:860,y:600}, {x:160,y:500}, {x:700,y:360}, {x:1040,y:360}, {x:160,y:80}, {x:1040,y:120}, {x:1040,y:660} ] },
        { id: "v-lava", name: "Rio de Lava", paths: [[ {x:640,y:-40}, {x:640,y:200}, {x:200,y:200}, {x:200,y:520}, {x:1080,y:520}, {x:1080,y:200}, {x:640,y:200} ]], nodes: [ {x:420,y:200}, {x:420,y:360}, {x:420,y:520}, {x:860,y:200}, {x:860,y:360}, {x:860,y:520}, {x:200,y:360}, {x:1080,y:360}, {x:640,y:360}, {x:640,y:520}, {x:60,y:520}, {x:1200,y:520} ] },
        { id: "v-ponte", name: "Ponte de Pedra", paths: [ [{x:-40,y:180}, {x:500,y:180}, {x:500,y:540}, {x:900,y:540}], [{x:1320,y:180}, {x:780,y:180}, {x:780,y:540}, {x:900,y:540}] ], nodes: [ {x:300,y:300}, {x:500,y:360}, {x:700,y:360}, {x:980,y:300}, {x:640,y:180}, {x:640,y:540}, {x:300,y:540}, {x:980,y:540}, {x:160,y:420}, {x:1120,y:420}, {x:640,y:420}, {x:900,y:400} ] },
        { id: "v-forja", name: "Forja", paths: [[ {x:-40,y:600}, {x:400,y:600}, {x:400,y:300}, {x:880,y:300}, {x:880,y:600}, {x:640,y:600}, {x:640,y:100} ]], nodes: [ {x:200,y:450}, {x:600,y:300}, {x:600,y:450}, {x:600,y:600}, {x:880,y:450}, {x:1040,y:300}, {x:1040,y:600}, {x:200,y:200}, {x:400,y:100}, {x:800,y:100}, {x:200,y:680}, {x:1040,y:100} ] },
        { id: "v-caldeira", name: "Caldeira", paths: [[ {x:-40,y:100}, {x:1160,y:100}, {x:1160,y:660}, {x:120,y:660}, {x:120,y:360}, {x:640,y:360} ]], nodes: [ {x:300,y:200}, {x:600,y:200}, {x:900,y:200}, {x:1040,y:380}, {x:300,y:520}, {x:600,y:520}, {x:900,y:520}, {x:300,y:380}, {x:640,y:480}, {x:780,y:380}, {x:1040,y:580}, {x:460,y:660} ] },
        { id: "v-chamine", name: "Chaminé", paths: [ [{x:300,y:-40}, {x:300,y:360}, {x:640,y:360}, {x:640,y:660}], [{x:980,y:-40}, {x:980,y:360}, {x:640,y:360}, {x:640,y:660}] ], nodes: [ {x:480,y:200}, {x:480,y:520}, {x:800,y:200}, {x:800,y:520}, {x:640,y:200}, {x:640,y:520}, {x:300,y:520}, {x:980,y:520}, {x:160,y:360}, {x:1120,y:360}, {x:480,y:360}, {x:800,y:360} ] },
        { id: "v-obsidiana", name: "Obsidiana", paths: [[ {x:-40,y:360}, {x:300,y:360}, {x:300,y:100}, {x:980,y:100}, {x:980,y:360}, {x:640,y:360}, {x:640,y:660} ]], nodes: [ {x:160,y:230}, {x:640,y:100}, {x:640,y:230}, {x:640,y:500}, {x:980,y:230}, {x:1120,y:360}, {x:300,y:500}, {x:300,y:660}, {x:800,y:660}, {x:160,y:100}, {x:160,y:560}, {x:1120,y:100} ] },
        { id: "v-abismo", name: "Abismo", paths: [ [{x:-40,y:150}, {x:400,y:150}, {x:400,y:500}, {x:800,y:500}, {x:800,y:250}], [{x:1320,y:600}, {x:900,y:600}, {x:900,y:500}, {x:800,y:500}, {x:800,y:250}] ], nodes: [ {x:200,y:320}, {x:600,y:320}, {x:600,y:500}, {x:1060,y:380}, {x:960,y:500}, {x:200,y:500}, {x:400,y:660}, {x:1060,y:660}, {x:800,y:120}, {x:400,y:50}, {x:1060,y:180}, {x:640,y:660} ] },
        { id: "v-tuneis", name: "Túneis", paths: [[ {x:-40,y:80}, {x:500,y:80}, {x:500,y:300}, {x:200,y:300}, {x:200,y:560}, {x:800,y:560}, {x:800,y:300}, {x:1100,y:300}, {x:1100,y:600}, {x:640,y:600} ]], nodes: [ {x:250,y:180}, {x:700,y:180}, {x:350,y:430}, {x:500,y:430}, {x:650,y:430}, {x:950,y:180}, {x:950,y:450}, {x:800,y:680}, {x:350,y:680}, {x:200,y:680}, {x:1100,y:450}, {x:1100,y:180} ] },
        { id: "v-trono", name: "Trono de Fogo", paths: [ [{x:-40,y:120}, {x:300,y:120}, {x:300,y:400}, {x:640,y:400}, {x:640,y:660}], [{x:1320,y:120}, {x:980,y:120}, {x:980,y:400}, {x:640,y:400}, {x:640,y:660}], [{x:640,y:-40}, {x:640,y:660}] ], nodes: [ {x:160,y:260}, {x:460,y:260}, {x:460,y:540}, {x:820,y:260}, {x:820,y:540}, {x:1120,y:260}, {x:640,y:260}, {x:300,y:560}, {x:980,y:560}, {x:160,y:520}, {x:1120,y:520}, {x:640,y:540} ] },
      ],
      enemies: {
        v_grunt:  { name: "Imp",       icon: "👹", hpMul: 1.0, speedMul: 1.0, reward: 5, color: "#ff4500", radius: 12, desc: "Pequeno demônio resistente a queimadura. Rápido e numeroso." },
        v_fast:   { name: "Salamandra", icon: "🦎", hpMul: 0.5, speedMul: 1.7, reward: 6, color: "#ff8c00", radius: 10, desc: "Veloz e deixa rastro de fogo ao passar." },
        v_tank:   { name: "Golem",     icon: "🗿", hpMul: 3.0, speedMul: 0.5, reward: 12, color: "#8b4513", radius: 24, desc: "Colossal de pedra, imune a slow e freeze." },
        v_flyer:  { name: "Fênix",     icon: "🔥", hpMul: 0.7, speedMul: 1.1, reward: 7, color: "#ff6347", radius: 13, flying: true, desc: "Ao morrer, renasce com 50% de HP uma vez." },
        v_healer: { name: "Xamã",      icon: "🔮", hpMul: 1.5, speedMul: 0.8, reward: 10, color: "#dc143c", radius: 15, heal: 16, healRange: 100, healInterval: 1.4, desc: "Cura aliados e dá buff de velocidade temporário." },
        v_boss:   { name: "Senhor das Chamas", icon: "🌋", hpMul: 13, speedMul: 0.4, reward: 55, color: "#b22222", radius: 30, desc: "Aura de calor reduz alcance de torres próximas. O vulcão treme sob seus passos." },
      },
      levels: [
        { id: 1, name: "Boca do Vulcão", mapId: "v-cratera", waves: 5, enemies: [], boss: false, hp: 0.9, par: 120, reqStars: 0, intro: "O calor é insuportável. Imps emergem da cratera — pequenos, mas em grande número. Posicione suas defesas." },
        { id: 2, name: "Rastro de Fogo", mapId: "v-lava", waves: 6, enemies: ["v_fast"], boss: false, hp: 1.0, par: 135, reqStars: 2, intro: "Salamandras deslizam pelo rio de lava, mais velozes que qualquer coisa que você já enfrentou." },
        { id: 3, name: "Pedra Viva", mapId: "v-ponte", waves: 7, enemies: ["v_fast", "v_tank"], boss: false, hp: 1.0, par: 340, reqStars: 4, intro: "Golems de pedra cruzam a ponte. Imunes a slow — só dano bruto os derruba." },
        { id: 4, name: "A Forja", mapId: "v-forja", waves: 8, enemies: ["v_fast", "v_tank"], boss: false, hp: 1.0, par: 230, reqStars: 6, intro: "A forja demônica produz guerreiros sem parar. O caminho serpenteia — use cada curva a seu favor." },
        { id: 5, name: "Asas de Fogo", mapId: "v-caldeira", waves: 8, enemies: ["v_fast", "v_tank", "v_flyer"], boss: false, hp: 1.05, par: 250, reqStars: 8, intro: "Fênix erguem voo sobre a caldeira. Se você derrubar uma, ela renasce das cinzas." },
        { id: 6, name: "Chaminé Dupla", mapId: "v-chamine", waves: 9, enemies: ["v_fast", "v_tank", "v_flyer"], boss: false, hp: 0.85, par: 310, reqStars: 10, intro: "Duas chaminés vulcânicas despejam ondas simultâneas. Divida suas forças." },
        { id: 7, name: "Xamãs do Fogo", mapId: "v-obsidiana", waves: 9, enemies: ["v_fast", "v_tank", "v_flyer", "v_healer"], boss: false, hp: 1.1, par: 350, reqStars: 12, intro: "Xamãs surgem entre a obsidiana, curando e acelerando seus aliados. Priorize-os." },
        { id: 8, name: "O Abismo", mapId: "v-abismo", waves: 10, enemies: ["v_fast", "v_tank", "v_flyer", "v_healer"], boss: false, hp: 0.85, par: 280, reqStars: 14, intro: "O abismo cuspirá hordas de dois lados. Cada torre conta — sem margem para erros." },
        { id: 9, name: "Túneis de Magma", mapId: "v-tuneis", waves: 11, enemies: ["v_fast", "v_tank", "v_flyer", "v_healer"], boss: false, hp: 1.1, par: 620, reqStars: 16, intro: "Túneis intermináveis de magma trazem ondas pesadas. Monte defesas em camadas nos corredores." },
        { id: 10, name: "O Senhor das Chamas", mapId: "v-trono", waves: 12, enemies: ["v_fast", "v_tank", "v_flyer", "v_healer"], boss: true, hp: 0.95, par: 400, reqStars: 18, intro: "O Senhor das Chamas avança por três caminhos. Sua aura reduz o alcance de tudo ao redor. Última defesa no vulcão." },
      ],
      towerUnlock: { id: "deepfrost", name: "Esfera de Gelo Profundo", color: "#9be7ff", cost: 32,
        damage: 10, range: 130, cooldown: 1.4, projSpeed: 440,
        desc: "Congela o alvo completamente por um breve instante.",
        stun: 1.0, stunChance: 0.30 },
      mechanic: "eruption",
    },
    // ==================== O OCEANO ====================
    {
      id: "oceano", name: "O Oceano", color: "#89b4fa", unlockStars: 25,
      maps: [
        { id: "o-cais", name: "Cais", paths: [[ {x:-40,y:360}, {x:400,y:360}, {x:400,y:120}, {x:880,y:120}, {x:880,y:560}, {x:640,y:560} ]], nodes: [ {x:200,y:240}, {x:640,y:120}, {x:640,y:340}, {x:640,y:560}, {x:880,y:340}, {x:1060,y:340}, {x:200,y:500}, {x:400,y:560}, {x:1060,y:120}, {x:200,y:100}, {x:1060,y:560}, {x:400,y:200} ] },
        { id: "o-maremoto", name: "Maremoto", paths: [[ {x:640,y:-40}, {x:640,y:300}, {x:200,y:300}, {x:200,y:600}, {x:1080,y:600}, {x:1080,y:300}, {x:640,y:300} ]], nodes: [ {x:420,y:300}, {x:420,y:450}, {x:420,y:600}, {x:860,y:300}, {x:860,y:450}, {x:860,y:600}, {x:200,y:450}, {x:1080,y:450}, {x:640,y:450}, {x:640,y:600}, {x:640,y:150}, {x:60,y:600} ] },
        { id: "o-recife", name: "Recife", paths: [ [{x:-40,y:200}, {x:480,y:200}, {x:480,y:520}, {x:900,y:520}], [{x:1320,y:200}, {x:800,y:200}, {x:800,y:520}, {x:900,y:520}] ], nodes: [ {x:280,y:360}, {x:480,y:360}, {x:640,y:360}, {x:1000,y:360}, {x:640,y:200}, {x:640,y:520}, {x:280,y:520}, {x:1000,y:520}, {x:160,y:360}, {x:1120,y:360}, {x:900,y:380}, {x:280,y:100} ] },
        { id: "o-farol", name: "Farol", paths: [[ {x:-40,y:600}, {x:300,y:600}, {x:300,y:200}, {x:700,y:200}, {x:700,y:500}, {x:1100,y:500}, {x:1100,y:200}, {x:800,y:200} ]], nodes: [ {x:160,y:400}, {x:500,y:200}, {x:500,y:350}, {x:500,y:500}, {x:900,y:350}, {x:1100,y:350}, {x:900,y:650}, {x:160,y:200}, {x:700,y:350}, {x:300,y:400}, {x:1100,y:650}, {x:160,y:680} ] },
        { id: "o-naufragio", name: "Naufrágio", paths: [[ {x:-40,y:100}, {x:1140,y:100}, {x:1140,y:660}, {x:140,y:660}, {x:140,y:360}, {x:640,y:360} ]], nodes: [ {x:280,y:200}, {x:560,y:200}, {x:840,y:200}, {x:1020,y:380}, {x:280,y:520}, {x:560,y:520}, {x:840,y:520}, {x:280,y:360}, {x:640,y:480}, {x:780,y:380}, {x:1020,y:580}, {x:440,y:660} ] },
        { id: "o-porto", name: "Porto", paths: [ [{x:200,y:-40}, {x:200,y:360}, {x:640,y:360}, {x:640,y:660}], [{x:1080,y:-40}, {x:1080,y:360}, {x:640,y:360}, {x:640,y:660}] ], nodes: [ {x:400,y:200}, {x:400,y:520}, {x:880,y:200}, {x:880,y:520}, {x:640,y:200}, {x:640,y:520}, {x:200,y:520}, {x:1080,y:520}, {x:80,y:360}, {x:1200,y:360}, {x:400,y:660}, {x:880,y:660} ] },
        { id: "o-gruta", name: "Gruta Marinha", paths: [[ {x:-40,y:360}, {x:220,y:360}, {x:220,y:100}, {x:660,y:100}, {x:660,y:600}, {x:1060,y:600}, {x:1060,y:360} ]], nodes: [ {x:100,y:230}, {x:440,y:100}, {x:440,y:350}, {x:660,y:350}, {x:860,y:350}, {x:860,y:600}, {x:1060,y:480}, {x:220,y:560}, {x:660,y:700}, {x:1180,y:250}, {x:220,y:680}, {x:1060,y:200} ] },
        { id: "o-tempestade", name: "Tempestade", paths: [[ {x:640,y:-40}, {x:640,y:160}, {x:200,y:160}, {x:200,y:560}, {x:1080,y:560}, {x:1080,y:160}, {x:640,y:160}, {x:640,y:360} ]], nodes: [ {x:420,y:160}, {x:420,y:360}, {x:420,y:560}, {x:860,y:160}, {x:860,y:360}, {x:860,y:560}, {x:200,y:360}, {x:1080,y:360}, {x:640,y:560}, {x:80,y:560}, {x:1200,y:560}, {x:640,y:660} ] },
        { id: "o-abismo", name: "Abismo Oceânico", paths: [ [{x:-40,y:150}, {x:400,y:150}, {x:400,y:500}, {x:800,y:500}, {x:800,y:280}], [{x:-40,y:550}, {x:400,y:550}, {x:400,y:500}] ], nodes: [ {x:200,y:320}, {x:600,y:320}, {x:600,y:500}, {x:200,y:680}, {x:960,y:380}, {x:960,y:560}, {x:400,y:680}, {x:1100,y:280}, {x:1100,y:500}, {x:200,y:50}, {x:600,y:50}, {x:1100,y:680} ] },
        { id: "o-trono", name: "Trono das Marés", paths: [ [{x:-40,y:120}, {x:300,y:120}, {x:300,y:400}, {x:640,y:400}, {x:640,y:660}], [{x:1320,y:120}, {x:980,y:120}, {x:980,y:400}, {x:640,y:400}, {x:640,y:660}], [{x:640,y:-40}, {x:640,y:660}] ], nodes: [ {x:160,y:260}, {x:460,y:260}, {x:460,y:540}, {x:820,y:260}, {x:820,y:540}, {x:1120,y:260}, {x:640,y:260}, {x:300,y:560}, {x:980,y:560}, {x:160,y:520}, {x:1120,y:520}, {x:640,y:540} ] },
      ],
      enemies: {
        o_grunt:  { name: "Marinheiro",  icon: "⚓", hpMul: 1.0, speedMul: 1.0, reward: 5, color: "#4169e1", radius: 13, desc: "Marinheiro destemido. Ganha velocidade na chuva." },
        o_fast:   { name: "Sereia",      icon: "🧜", hpMul: 0.5, speedMul: 1.7, reward: 6, color: "#00ced1", radius: 11, desc: "Veloz e encanta uma torre ao passar, desativando-a brevemente." },
        o_tank:   { name: "Caranguejo",  icon: "🦀", hpMul: 2.8, speedMul: 0.55, reward: 11, color: "#cd5c5c", radius: 21, desc: "Blindado e reflete parte do dano de volta na torre." },
        o_flyer:  { name: "Gaivota",     icon: "🐦", hpMul: 0.35, speedMul: 1.25, reward: 4, color: "#87ceeb", radius: 9, flying: true, desc: "Voa em bando — fraca sozinha, perigosa em grupo." },
        o_healer: { name: "Médica Naval", icon: "💊", hpMul: 1.5, speedMul: 0.8, reward: 10, color: "#3cb371", radius: 15, heal: 16, healRange: 95, healInterval: 1.4, desc: "Cura aliados e remove efeitos negativos." },
        o_boss:   { name: "Kraken",      icon: "🐙", hpMul: 14, speedMul: 0.38, reward: 60, color: "#191970", radius: 32, desc: "Tentáculos bloqueiam nós temporariamente. O terror das profundezas." },
      },
      levels: [
        { id: 1, name: "O Cais", mapId: "o-cais", waves: 5, enemies: [], boss: false, hp: 0.9, par: 120, reqStars: 0, intro: "O sal paira no ar. Marinheiros desembarcam no cais — a perseguição ao Bruxo chegou ao litoral." },
        { id: 2, name: "Canto das Sereias", mapId: "o-maremoto", waves: 6, enemies: ["o_fast"], boss: false, hp: 1.0, par: 135, reqStars: 2, intro: "Sereias deslizam pelas ondas, encantando suas torres ao passar. Cuidado com a velocidade delas." },
        { id: 3, name: "Recife", mapId: "o-recife", waves: 7, enemies: ["o_fast", "o_tank"], boss: false, hp: 0.9, par: 340, reqStars: 4, intro: "Caranguejos enormes emergem do recife. Sua carapaça reflete dano — ataque com tudo ou recue." },
        { id: 4, name: "O Farol", mapId: "o-farol", waves: 8, enemies: ["o_fast", "o_tank"], boss: false, hp: 1.0, par: 230, reqStars: 6, intro: "O farol ilumina um caminho tortuoso. Use cada curva para maximizar o tempo de tiro." },
        { id: 5, name: "Revoada", mapId: "o-naufragio", waves: 8, enemies: ["o_fast", "o_tank", "o_flyer"], boss: false, hp: 1.05, par: 250, reqStars: 8, intro: "Gaivotas em bando cortam os céus do naufrágio. Fracas sozinhas, mortais em grupo." },
        { id: 6, name: "Porto Duplo", mapId: "o-porto", waves: 9, enemies: ["o_fast", "o_tank", "o_flyer"], boss: false, hp: 0.85, par: 310, reqStars: 10, intro: "Duas frotas atracam simultaneamente no porto. Defenda os dois lados ou será cercado." },
        { id: 7, name: "Gruta Marinha", mapId: "o-gruta", waves: 9, enemies: ["o_fast", "o_tank", "o_flyer", "o_healer"], boss: false, hp: 1.1, par: 350, reqStars: 12, intro: "A Médica Naval surge nas cavernas, curando e limpando venenos. Elimine-a rápido." },
        { id: 8, name: "Tempestade", mapId: "o-tempestade", waves: 10, enemies: ["o_fast", "o_tank", "o_flyer", "o_healer"], boss: false, hp: 0.9, par: 280, reqStars: 14, intro: "A tempestade ruge. Ondas convergem em espiral pelo olho do furacão." },
        { id: 9, name: "Abismo Oceânico", mapId: "o-abismo", waves: 11, enemies: ["o_fast", "o_tank", "o_flyer", "o_healer"], boss: false, hp: 0.9, par: 620, reqStars: 16, intro: "Duas correntes das profundezas trazem hordas imensas. Monte defesas no ponto de convergência." },
        { id: 10, name: "O Kraken", mapId: "o-trono", waves: 12, enemies: ["o_fast", "o_tank", "o_flyer", "o_healer"], boss: true, hp: 0.95, par: 400, reqStars: 18, intro: "O Kraken emerge. Três tentáculos avançam por caminhos distintos, bloqueando nós ao seu redor. Última batalha." },
      ],
      towerUnlock: { id: "lightning", name: "Esfera de Raio", color: "#f9e2af", cost: 36,
        damage: 20, range: 155, cooldown: 1.0, projSpeed: 550,
        desc: "Raio em cadeia que salta para inimigos próximos.",
        chain: 2, chainRange: 90, chainDecay: 0.5 },
      mechanic: "tide",
    },
  ];

  // ----- Atalhos derivados dos territórios -----
  const ALL_MAPS = TERRITORIES.flatMap(t => t.maps);
  const ALL_LEVELS = TERRITORIES.flatMap(t => t.levels.map(l => ({ ...l, territoryId: t.id })));
  const ALL_ENEMIES = (() => {
    const merged = {};
    for (const t of TERRITORIES) Object.assign(merged, t.enemies);
    return merged;
  })();

  let activeTerritory = "reino";
  const territoryById = (tid) => TERRITORIES.find(t => t.id === tid) || TERRITORIES[0];
  const territoryMaps = (tid) => territoryById(tid).maps;
  const territoryEnemies = (tid) => territoryById(tid).enemies;
  const territoryLevels = (tid) => territoryById(tid).levels;

  function getAvailableTowers() {
    const towers = [...TOWER_TYPES];
    for (const t of TERRITORIES) {
      if (t.towerUnlock && Progress.territoryOpen(t.id)) towers.push(t.towerUnlock);
    }
    return towers;
  }

  // Compat: referências legadas
  const MAPS = ALL_MAPS;
  const LEVELS = ALL_LEVELS;
  const ENEMY_TYPES = ALL_ENEMIES;

  let PATHS, CORE, NODES, currentMap;
  function applyMap(id) {
    const m = MAPS.find((x) => x.id === id) || MAPS[0];
    currentMap = m.id;
    // cada mapa tem 1+ caminhos (entradas); todos terminam na Torre.
    PATHS = m.paths || [m.path];
    CORE = PATHS[0][PATHS[0].length - 1];
    NODES = m.nodes.map((n) => ({ x: n.x, y: n.y, taken: false }));
  }
  applyMap("serpent");

  let activeLevel = 1;
  let gameMode = "campaign"; // "campaign" (fases, sem dificuldade) | "free" (Modo Livre)
  const Progress = (() => {
    const KEY = "overhead_campaign_v2";
    const OLD_KEY = "overhead_campaign_v1";
    function migrate() {
      try {
        const old = JSON.parse(localStorage.getItem(OLD_KEY));
        if (!old) return;
        const v2 = { _version: 2, territories: { reino: { levels: {} } } };
        for (const [id, entry] of Object.entries(old)) {
          v2.territories.reino.levels[id] = entry;
        }
        localStorage.setItem(KEY, JSON.stringify(v2));
        localStorage.removeItem(OLD_KEY);
      } catch (e) {}
    }
    migrate();
    const blank = () => ({ _version: 2, territories: {} });
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { return blank(); } };
    const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    function tLevels(data, tid) { return (data.territories[tid] && data.territories[tid].levels) || {}; }
    function totalStarsFor(tid) { return Object.values(tLevels(load(), tid)).reduce((s, e) => s + (e.stars || 0), 0); }
    function totalStarsAll() { return TERRITORIES.reduce((s, t) => s + totalStarsFor(t.id), 0); }
    return {
      get(id, tid) {
        tid = tid || activeTerritory;
        return tLevels(load(), tid)[id] || { best: 0, stars: 0 };
      },
      record(id, score, stars, tid) {
        tid = tid || activeTerritory;
        const all = load();
        if (!all.territories[tid]) all.territories[tid] = { levels: {} };
        const lvs = all.territories[tid].levels;
        const cur = lvs[id] || { best: 0, stars: 0 };
        lvs[id] = { best: Math.max(cur.best, score), stars: Math.max(cur.stars, stars) };
        save(all); return lvs[id];
      },
      totalStars: totalStarsFor,
      totalStarsAll,
      territoryOpen(tid) {
        const t = territoryById(tid);
        if (t.unlockStars === 0) return true;
        const idx = TERRITORIES.indexOf(t);
        if (idx <= 0) return true;
        const prev = TERRITORIES[idx - 1];
        return totalStarsFor(prev.id) >= t.unlockStars;
      },
      unlocked(id, tid) {
        tid = tid || activeTerritory;
        const lv = territoryLevels(tid).find((l) => l.id === id) || { reqStars: 0 };
        return totalStarsFor(tid) >= lv.reqStars;
      },
    };
  })();
  const levelById = (id, tid) => {
    const lvs = tid ? territoryLevels(tid) : territoryLevels(activeTerritory);
    return lvs.find((l) => l.id === id) || lvs[0] || LEVELS[0];
  };
  const isFree = () => !!state && state.mode === "free";
  const levelWaves = () => isFree() ? CONFIG.totalWaves : (levelById(activeLevel).waves || CONFIG.totalWaves);
  // Estrelas por DESEMPENHO: ★ vencer · ★★ invicto OU rápido · ★★★ invicto E rápido.
  const starsForResult = (won, flawless, fast) =>
    !won ? 0 : (flawless && fast ? 3 : (flawless || fast ? 2 : 1));

  // ----- Tipos de torre (esferas) -----
  const TOWER_TYPES = [
    {
      id: "arcane", name: "Esfera Arcana", color: "#6ee7ff", cost: 14,
      damage: 18, range: 150, cooldown: 0.6, projSpeed: 520,
      desc: "Disparo rápido e equilibrado. Boa contra grupos.",
      manaBonus: 0.10, // chance de mana extra ao derrotar
    },
    {
      id: "frost", name: "Esfera Gélida", color: "#7ad7ff", cost: 22,
      damage: 12, range: 135, cooldown: 0.85, projSpeed: 460,
      desc: "Congela inimigos, reduzindo sua velocidade.",
      slow: 0.45, slowDur: 1.6,
    },
    {
      id: "doom", name: "Esfera Fatal", color: "#b388ff", cost: 34,
      damage: 46, range: 175, cooldown: 1.25, projSpeed: 600,
      desc: "Dano pesado e chance de golpe fatal (morte instantânea).",
      fatal: 0.12,
    },
    {
      id: "blast", name: "Esfera Ígnea", color: "#ff9f6b", cost: 40,
      damage: 26, range: 145, cooldown: 1.1, projSpeed: 480,
      desc: "Explosão em área + queimadura contínua.",
      splash: 70, burn: 9, burnDur: 3,
    },
  ];

  // Composição de cada onda (lista de tipos de inimigo)
  function territoryEnemyKeys(tid) {
    const keys = Object.keys(territoryEnemies(tid));
    const roles = {};
    for (const k of keys) {
      const suffix = k.includes("_") ? k.split("_").pop() : k;
      roles[suffix] = k;
    }
    return roles;
  }

  function buildWave(n) {
    const list = [];
    const r = territoryEnemyKeys(activeTerritory);
    const grunt = r.grunt || Object.keys(territoryEnemies(activeTerritory))[0];
    const fast = r.fast, tank = r.tank, flyer = r.flyer, healer = r.healer, boss = r.boss;

    if (isFree()) {
      const count = 6 + Math.floor(n * 1.9);
      for (let i = 0; i < count; i++) {
        let t = grunt;
        if (fast   && n >= 2 && i % 4 === 0) t = fast;
        if (tank   && n >= 4 && i % 6 === 0) t = tank;
        if (flyer  && n >= 4 && i % 7 === 3) t = flyer;
        if (healer && n >= 6 && i % 9 === 4) t = healer;
        list.push(t);
      }
      if (boss && n % 5 === 0) list.push(boss);
      return list;
    }
    const cfg = levelById(activeLevel);
    const allow = cfg.enemies || [];
    const count = 5 + Math.floor(n * 1.8);
    for (let i = 0; i < count; i++) {
      let t = grunt;
      for (const a of allow) {
        const aSuffix = a.includes("_") ? a.split("_").pop() : a;
        if (aSuffix === "fast"   && i % 4 === 0) t = a;
        if (aSuffix === "tank"   && i % 6 === 0) t = a;
        if (aSuffix === "flyer"  && i % 7 === 3) t = a;
        if (aSuffix === "healer" && i % 9 === 4) t = a;
      }
      list.push(t);
    }
    if (cfg.boss && boss && n % 5 === 0) list.push(boss);
    return list;
  }

  // ===================================================================
  //  MECÂNICAS DE TERRITÓRIO — fog (floresta), eruption (vulcão), tide (oceano)
  // ===================================================================
  const MECHANICS = {
    fog: {
      init(st) {
        st.fogNodes = new Set();
        const map = MAPS.find(m => m.id === currentMap);
        if (!map) return;
        const nodeCount = NODES.length;
        for (let i = 0; i < nodeCount; i++) {
          if (i % 3 === 1) st.fogNodes.add(i);
        }
      },
      update(st, dt) {},
      draw(ctx, cam) {
        if (!state.fogNodes || !state.fogNodes.size) return;
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.04 * Math.sin(state.time * 1.5);
        ctx.fillStyle = "#228b22";
        for (const i of state.fogNodes) {
          const n = NODES[i];
          if (!n) continue;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 70, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
      modRange(st, tower, baseRange) {
        if (!st.fogNodes) return baseRange;
        const idx = NODES.indexOf(tower.node);
        return st.fogNodes.has(idx) ? baseRange * 0.65 : baseRange;
      },
    },
    eruption: {
      init(st) { st.eruptionTimer = 25; st.eruptionFlash = []; },
      update(st, dt) {
        if (!st.running) return;
        st.eruptionTimer -= dt;
        if (st.eruptionTimer <= 0) {
          st.eruptionTimer = 22 + Math.random() * 8;
          const targets = st.towers.filter(() => Math.random() < 0.2).slice(0, 1);
          for (const tw of targets) {
            if (!tw.hp) tw.hp = 4;
            tw.hp--;
            spawnParticles(tw.x, tw.y, "#ff4500", 12, 100);
            spawnRing(tw.x, tw.y, "#ff4500", 50, 0.5);
            spawnFloater(tw.x, tw.y - 30, "Erupção!", "#ff4500", 16);
            if (tw.hp <= 0) {
              tw.node.taken = false;
              st.towers = st.towers.filter(t => t !== tw);
              if (st.selectedTower === tw) st.selectedTower = null;
            }
          }
          st.shake = Math.max(st.shake, 0.3);
        }
        st.eruptionFlash = (st.eruptionFlash || []).filter(f => f.life > 0);
      },
      draw(ctx, cam) {
        if (state.eruptionTimer < 3) {
          ctx.save();
          ctx.globalAlpha = 0.06 * (1 + Math.sin(state.time * 8));
          ctx.fillStyle = "#ff4500";
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      },
    },
    tide: {
      init(st) {
        st.tideCycle = 0;
        st.tideHigh = false;
        st.tideNodes = new Set();
        const nodeCount = NODES.length;
        for (let i = 0; i < nodeCount; i++) {
          if (i % 5 === 2) st.tideNodes.add(i);
        }
      },
      update(st, dt) {
        st.tideCycle += dt;
        const wasHigh = st.tideHigh;
        st.tideHigh = Math.sin(st.tideCycle * Math.PI / 15) > 0.3;
        if (st.tideHigh && !wasHigh) {
          for (const i of st.tideNodes) {
            const tw = st.towers.find(t => t.node === NODES[i]);
            if (tw) { tw.tideDisabled = true; spawnFloater(tw.x, tw.y - 20, "Submersa!", "#89b4fa", 14); }
          }
        } else if (!st.tideHigh && wasHigh) {
          for (const tw of st.towers) tw.tideDisabled = false;
        }
      },
      draw(ctx, cam) {
        if (!state.tideHigh || !state.tideNodes) return;
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.05 * Math.sin(state.time * 2);
        ctx.fillStyle = "#4169e1";
        for (const i of state.tideNodes) {
          const n = NODES[i];
          if (!n) continue;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    },
  };

  function activeMechanic() {
    const t = territoryById(activeTerritory);
    return t.mechanic ? MECHANICS[t.mechanic] : null;
  }

  // ===================================================================
  //  ESTADO DO JOGO
  // ===================================================================
  let state;
  function newGame() {
    const diff = DIFFICULTIES[(state && state.difficulty)] || DIFFICULTIES.normal;
    state = {
      difficulty: (state && state.difficulty) || "normal",
      mode: gameMode,
      levelId: activeLevel,
      mana: diff.mana,
      lives: diff.lives,
      maxLives: diff.lives,   // p/ saber se terminou invicto (sem vazar)
      score: 0,
      wave: 0,
      running: false,      // true durante uma onda
      paused: false,
      gameOver: false,
      won: false,
      speed: 1,
      shake: 0,            // tremor de tela ao tomar dano no torre
      flash: 0,            // vinheta vermelha ao tomar dano no torre
      abilities: { freeze: 0, storm: 0 }, // cooldown restante (s) de cada habilidade
      time: 0,             // relógio de jogo (s), avança com dt — base dos timers de efeito
      victoryPending: false, victoryTimer: 0, // sequência animada de vitória antes do modal
      endless: false,      // modo infinito: sem vitória na onda 20
      globals: { dmg: 0, rng: 0 }, // melhorias globais compradas (ralo de mana)
      enemies: [],
      towers: [],
      projectiles: [],
      particles: [],
      floaters: [],        // textos de dano
      spawnQueue: [],
      spawnIx: 0,            // round-robin de entradas (mapas com 2+ caminhos)
      spawnTimer: 0,
      betweenTimer: 0,     // contagem entre ondas
      selectedType: null,  // tipo escolhido na loja p/ construir
      selectedTower: null, // torre selecionada no campo
    };
  }
  newGame();

  // ===================================================================
  //  HELPERS
  // ===================================================================
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (a, b) => a + Math.random() * (b - a);

  function towerType(id) { return TOWER_TYPES.find(t => t.id === id) || getAvailableTowers().find(t => t.id === id); }

  // ----- Stats efetivos por torre (nível da torre + melhorias globais) -----
  function effDamage(tw)   { return tw.type.damage   * Math.pow(CONFIG.lvlDamageMul, tw.level - 1) * (1 + CONFIG.globalDmgStep * state.globals.dmg); }
  function effRange(tw)    {
    let r = tw.type.range * Math.pow(CONFIG.lvlRangeMul, tw.level - 1) * (1 + CONFIG.globalRngStep * state.globals.rng);
    const mech = activeMechanic();
    if (mech && mech.modRange) r = mech.modRange(state, tw, r);
    return r;
  }
  function effCooldown(tw) { return tw.type.cooldown * Math.pow(CONFIG.lvlCooldownMul, tw.level - 1); }
  function upgradeCost(tw) { return Math.round(tw.type.cost * Math.pow(CONFIG.upgradeCostMul, tw.level)); }

  // Melhorias globais — ralo de mana sem teto (custo escala com o nível atual)
  const GLOBALS = {
    dmg: { name: "Foco Arcano", desc: "+dano de todas as torres", base: 60, mul: 1.55, color: "#ffd166" },
    rng: { name: "Lentes Rúnicas", desc: "+alcance de todas as torres", base: 50, mul: 1.5, color: "#6ee7ff" },
  };
  function globalCost(kind) { return Math.round(GLOBALS[kind].base * Math.pow(GLOBALS[kind].mul, state.globals[kind])); }
  function buyGlobal(kind) {
    const cost = globalCost(kind);
    if (state.mana < cost) return false;
    state.mana -= cost;
    state.globals[kind]++;
    Sound.play("upgrade");
    updateHUD();
    return true;
  }

  function spawnFloater(x, y, text, color, size = 18) {
    state.floaters.push({ x, y, text, color, size, life: 0.8, vy: -38 });
  }
  function spawnParticles(x, y, color, n = 8, spread = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(spread * 0.3, spread);
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.3, 0.6), maxLife: 0.6, color, r: rand(2, 4),
      });
    }
  }
  // anel de impacto que expande e some — base do "juice"
  function spawnRing(x, y, color, maxR = 50, life = 0.45) {
    state.particles.push({ x, y, vx: 0, vy: 0, life, maxLife: life, color, ring: true, maxR });
  }

  // ===================================================================
  //  SOM — efeitos sintetizados via Web Audio (sem arquivos externos)
  // ===================================================================
  const Sound = (() => {
    let ctx = null, master = null, musicGain = null, enabled = true;
    let vol = 0.45, musicOn = true, musicTimer = null, step = 0;
    function applyVolume() { if (master) master.gain.value = enabled ? vol * 0.5 : 0; }
    function init() {
      if (ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyVolume();
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.5;
        musicGain.connect(master);
        if (musicOn) startMusic();
      } catch (e) { enabled = false; }
    }
    function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }

    // ----- Música de fundo: pad + arpejo sintetizados, em loop suave -----
    const CHORDS = [[0, 7, 12, 16], [-3, 4, 9, 12], [-5, 2, 7, 11], [-1, 4, 7, 14]];
    const noteFreq = (semi) => 220 * Math.pow(2, semi / 12); // base A3
    function pad(freq, t0, dur) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function pluck(freq, t0, dur) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function bar() {
      if (!ctx || !musicOn) return;
      const t0 = ctx.currentTime + 0.06;
      const ch = CHORDS[step % CHORDS.length];
      ch.forEach((s) => pad(noteFreq(s), t0, 2.1));            // acorde sustentado
      ch.forEach((s, i) => pluck(noteFreq(s + 12), t0 + i * 0.5, 0.35)); // arpejo
      step++;
    }
    function startMusic() {
      if (!ctx || musicTimer) return;
      bar();
      musicTimer = setInterval(bar, 2000);
    }
    function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
    function tone({ freq = 440, freq2 = null, type = "sine", dur = 0.12, vol = 0.5, delay = 0 }) {
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    const SFX = {
      shoot_arcane:  () => tone({ freq: 660, freq2: 900, type: "triangle", dur: 0.07, vol: 0.16 }),
      shoot_frost: () => tone({ freq: 520, freq2: 720, type: "sine",     dur: 0.10, vol: 0.15 }),
      shoot_doom:  () => tone({ freq: 200, freq2: 90,  type: "sawtooth", dur: 0.16, vol: 0.20 }),
      shoot_blast: () => tone({ freq: 300, freq2: 150, type: "square",   dur: 0.12, vol: 0.16 }),
      shoot_poison: () => tone({ freq: 180, freq2: 320, type: "sine", dur: 0.14, vol: 0.16 }),
      shoot_deepfrost: () => tone({ freq: 400, freq2: 800, type: "sine", dur: 0.12, vol: 0.15 }),
      shoot_lightning: () => { tone({ freq: 800, freq2: 1600, type: "sawtooth", dur: 0.08, vol: 0.18 }); tone({ freq: 1200, freq2: 400, type: "triangle", dur: 0.06, vol: 0.12, delay: 0.04 }); },
      kill:        () => tone({ freq: 880, freq2: 1320, type: "sine",    dur: 0.10, vol: 0.20 }),
      boss_die:    () => { tone({ freq: 120, freq2: 40, type: "sawtooth", dur: 0.5, vol: 0.3 });
                           tone({ freq: 300, freq2: 600, type: "triangle", dur: 0.3, vol: 0.2, delay: 0.05 }); },
      fatal:       () => tone({ freq: 140, freq2: 1200, type: "square",  dur: 0.18, vol: 0.24 }),
      build:       () => tone({ freq: 440, freq2: 660, type: "triangle", dur: 0.12, vol: 0.24 }),
      upgrade:     () => { tone({ freq: 523, type: "sine", dur: 0.10, vol: 0.22 });
                           tone({ freq: 784, type: "sine", dur: 0.12, vol: 0.22, delay: 0.08 }); },
      sell:        () => tone({ freq: 400, freq2: 200, type: "triangle", dur: 0.14, vol: 0.18 }),
      wave:        () => { tone({ freq: 330, type: "sawtooth", dur: 0.18, vol: 0.18 });
                           tone({ freq: 494, type: "sawtooth", dur: 0.22, vol: 0.18, delay: 0.12 }); },
      leak:        () => tone({ freq: 200, freq2: 80, type: "sawtooth",  dur: 0.30, vol: 0.26 }),
      lose:        () => tone({ freq: 300, freq2: 55, type: "sawtooth",  dur: 0.80, vol: 0.32 }),
      win:         () => [523, 659, 784, 1047].forEach((f, i) =>
                           tone({ freq: f, type: "triangle", dur: 0.25, vol: 0.24, delay: i * 0.13 })),
    };
    return {
      init, resume,
      play(name) { if (!enabled || !ctx) return; const f = SFX[name]; if (f) { resume(); f(); } },
      toggle() { enabled = !enabled; applyVolume(); return enabled; },
      isEnabled() { return enabled; },
      setVolume(v) { vol = Math.max(0, Math.min(1, v)); applyVolume(); },
      getVolume() { return vol; },
      setMusic(on) { musicOn = !!on; if (ctx) { on ? startMusic() : stopMusic(); } },
      isMusicOn() { return musicOn; },
    };
  })();

  // ===================================================================
  //  LEADERBOARD — top 10 local (localStorage)
  // ===================================================================
  const Leaderboard = (() => {
    const KEY = "overhead_scores_v1";
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
    function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
    function top() { return load().sort((a, b) => b.score - a.score).slice(0, 10); }
    function add(name, score, wave, won) {
      const list = load();
      const entry = { name: (name || "Anônimo").trim().slice(0, 14) || "Anônimo", score, wave, won, date: Date.now() };
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      save(list.slice(0, 10));
      return entry;
    }
    function qualifies(score) {
      if (score <= 0) return false;
      const l = top();
      return l.length < 10 || score > l[l.length - 1].score;
    }
    return { add, top, qualifies };
  })();

  // ===================================================================
  //  PREFERÊNCIAS — som, velocidade e modo infinito (localStorage)
  // ===================================================================
  const Prefs = (() => {
    const KEY = "overhead_prefs_v1";
    const def = { sound: true, speed: 1, endless: false, seenTutorial: false, difficulty: "normal", volume: 0.45, music: true, map: "serpent" };
    let data;
    try { data = { ...def, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch (e) { data = { ...def }; }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
    return {
      get: (k) => data[k],
      set: (k, v) => { data[k] = v; save(); },
    };
  })();

  // ===================================================================
  //  ONDAS
  // ===================================================================
  function startWave() {
    if (state.running || state.gameOver || state.victoryPending) return;
    state.wave++;
    if (!state.endless && state.wave > levelWaves()) { triggerVictory(); return; }
    state.running = true;
    state.betweenTimer = 0;
    state.spawnQueue = buildWave(state.wave);
    state.spawnTimer = 0;
    Sound.play("wave");
    showWaveBanner(state.wave);
    updateHUD();
    advanceCoach(2);
  }

  // banner "Onda N" que entra animado (juice)
  function showWaveBanner(n) {
    const b = document.getElementById("wave-banner");
    if (!b) return;
    b.textContent = "Onda " + n;
    b.classList.remove("show");
    void b.offsetWidth; // reinicia a animação CSS
    b.classList.add("show");
  }

  function waveHP() {
    const eff = 1 + (CONFIG.hpWaveConst - 1) * (diffCfg().hpRamp || 1);
    return CONFIG.baseHP * Math.pow(eff, state.wave - 1);
  }
  function waveSpeed() { return CONFIG.baseSpeed * Math.pow(CONFIG.speedWaveConst, state.wave - 1); }

  function spawnEnemy(typeId, pathIx = 0) {
    const t = ENEMY_TYPES[typeId];
    const maxHP = waveHP() * t.hpMul * diffCfg().hpMul * (isFree() ? 1 : (levelById(activeLevel).hp || 1));
    const P = PATHS[pathIx] || PATHS[0];
    state.enemies.push({
      type: typeId, def: t,
      x: P[0].x, y: P[0].y,
      hp: maxHP, maxHP,
      baseSpeed: waveSpeed() * t.speedMul,
      slowUntil: 0, slowFactor: 1, stunUntil: 0,
      burn: 0, burnUntil: 0, burnTick: 0,
      poisons: [],
      healTick: t.healInterval || 0,
      path: pathIx, wp: 1, radius: t.radius, dead: false,
    });
  }

  // ===================================================================
  //  CONSTRUÇÃO
  // ===================================================================
  function nodeAt(p, r = 26) {
    return NODES.find(n => !n.taken && dist(n, p) < r);
  }

  // vibração curta (haptics) quando suportado — feedback tátil no mobile
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  function tryBuild(node) {
    const type = state.selectedType;
    if (!type) return;
    if (state.mana < type.cost) {
      spawnFloater(node.x, node.y, "Mana insuficiente!", "#ff6b81", 15);
      buzz([12, 40, 12]); // padrão de "negado"
      return;
    }
    state.mana -= type.cost;
    node.taken = true;
    const tower = {
      type, node, x: node.x, y: node.y, level: 1,
      cooldown: 0, angle: -Math.PI / 2, target: null,
      invested: type.cost, targetMode: "core",
    };
    state.towers.push(tower);
    spawnParticles(node.x, node.y, type.color, 12);
    spawnRing(node.x, node.y, type.color, 46, 0.4);          // pop de construção
    spawnFloater(node.x, node.y - 22, "✓ " + type.name, type.color, 16); // confirmação
    Sound.play("build");
    buzz(18); // confirmação tátil
    // já deixa a torre recém-construída selecionada (mostra o painel com stats,
    // melhorar e vender) — sem precisar tocar nela de novo.
    state.selectedTower = tower;
    state.selectedType = null;
    updateTowerButtons();
    updateHUD();
    refreshShop();
    advanceCoach(1);
  }

  function sellTower(tower) {
    const refund = Math.round(tower.invested * 0.6);
    state.mana += refund;
    tower.node.taken = false;
    state.towers = state.towers.filter(t => t !== tower);
    state.selectedTower = null;
    spawnFloater(tower.x, tower.y, "+" + refund, "#b388ff");
    Sound.play("sell");
    updateTowerButtons();
    updateHUD();
    refreshShop();
  }

  function upgradeTower(tower) {
    if (tower.level >= CONFIG.maxLevel) return;
    const cost = upgradeCost(tower);
    if (state.mana < cost) {
      spawnFloater(tower.x, tower.y, "Mana insuficiente!", "#ff6b81", 15);
      return;
    }
    state.mana -= cost;
    tower.level++;
    tower.invested += cost;
    spawnParticles(tower.x, tower.y, tower.type.color, 16, 120);
    spawnFloater(tower.x, tower.y - 24, "Nível " + tower.level + "!", tower.type.color, 18);
    Sound.play("upgrade");
    updateTowerButtons();
    updateHUD();
    refreshShop();
  }

  // ===================================================================
  //  COMBATE
  // ===================================================================
  // Modos de prioridade de alvo. Cada um devolve um "peso": escolhemos o
  // inimigo no alcance com o MENOR peso. Usar distância ao torre trata os
  // voadores (que cortam direto) de forma justa, não pelo progresso no caminho.
  const TARGET_MODES = {
    core: { label: "Torre", weight: (tw, e) => dist(e, CORE) },          // ameaça mais iminente
    strong: { label: "Forte", weight: (tw, e) => -e.hp },                 // maior HP
    weak: { label: "Fraco", weight: (tw, e) => e.hp },                    // menor HP (acaba rápido)
    near: { label: "Perto", weight: (tw, e) => dist(tw, e) },            // mais perto da torre
  };
  const TARGET_ORDER = ["core", "strong", "weak", "near"];

  function acquireTarget(tower, range) {
    const mode = TARGET_MODES[tower.targetMode] || TARGET_MODES.core;
    let best = Infinity, chosen = null;
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (dist(tower, e) <= range) {
        const w = mode.weight(tower, e);
        if (w < best) { best = w; chosen = e; }
      }
    }
    return chosen;
  }

  // Habilidades ativas — efeito instantâneo em todos os inimigos + cooldown.
  function activateAbility(key) {
    const a = ABILITIES[key];
    if (!a || state.gameOver || state.abilities[key] > 0) return false;
    const alive = state.enemies.filter(e => !e.dead);
    if (key === "freeze") {
      for (const e of alive) {
        e.slowFactor = Math.min(e.slowFactor, a.factor);
        e.slowUntil = Math.max(e.slowUntil, state.time + a.dur);
        spawnParticles(e.x, e.y, "#9be7ff", 6);
      }
      Sound.play("shoot_frost");
    } else if (key === "storm") {
      for (const e of alive) {
        spawnParticles(e.x, e.y, "#ffd166", 8);
        damageEnemy(e, e.maxHP * a.dmgPct + a.dmgFlat, null);
      }
      state.shake = Math.max(state.shake, 0.25);
      Sound.play("boss_die");
    }
    state.abilities[key] = a.cd;
    buzz(20);
    updateAbilities();
    updateHUD();
    return true;
  }

  function towerFire(tower, dt) {
    if (tower.tideDisabled) return;
    tower.cooldown -= dt;

    const range = effRange(tower);
    // (re)seleciona alvo conforme a prioridade escolhida na torre.
    if (!tower.target || tower.target.dead || dist(tower, tower.target) > range) {
      tower.target = acquireTarget(tower, range);
    }

    if (tower.target) {
      const tgt = tower.target;
      tower.angle = Math.atan2(tgt.y - tower.y, tgt.x - tower.x);
      if (tower.cooldown <= 0) {
        tower.cooldown = effCooldown(tower);
        fireProjectile(tower, tgt);
      }
    }
  }

  function fireProjectile(tower, target) {
    const t = tower.type;
    state.projectiles.push({
      x: tower.x, y: tower.y, target, type: t,
      damage: effDamage(tower),
      speed: t.projSpeed, dead: false,
    });
    Sound.play("shoot_" + t.id);
  }

  function damageEnemy(e, amount, type) {
    if (e.dead) return;
    e.hp -= amount;
    spawnFloater(e.x, e.y - e.radius, "-" + Math.round(amount), "#ff6b81", 14);

    // Efeito gélido (slow)
    if (type && type.slow) {
      e.slowFactor = Math.min(e.slowFactor, 1 - type.slow);
      e.slowUntil = Math.max(e.slowUntil, state.time + type.slowDur);
    }
    // Queimadura (burn DoT)
    if (type && type.burn) {
      e.burn = type.burn;
      e.burnUntil = state.time + type.burnDur;
    }
    // Veneno (DoT stackável)
    if (type && type.poison) {
      if (!e.poisons) e.poisons = [];
      e.poisons.push({ dps: type.poison, until: state.time + type.poisonDur, tick: 0 });
    }
    // Stun (congela completamente por breve instante)
    if (type && type.stun && type.stunChance && Math.random() < type.stunChance) {
      e.stunUntil = Math.max(e.stunUntil || 0, state.time + type.stun);
      spawnFloater(e.x, e.y - e.radius, "❄ Stun!", "#9be7ff", 14);
    }
    if (e.hp <= 0) killEnemy(e, type);
  }

  function killEnemy(e, type) {
    if (e.dead) return;
    e.dead = true;
    let reward = Math.round(e.def.reward * diffCfg().rewardMul);
    state.mana += reward;
    state.score += Math.round(reward * 2 + e.maxHP / 10);

    // Bônus de mana
    if (type && type.manaBonus && Math.random() < type.manaBonus) {
      state.mana += reward;
      spawnFloater(e.x, e.y, "+" + reward * 2 + " ✦", "#b388ff", 16);
    } else {
      spawnFloater(e.x, e.y, "+" + reward, "#b388ff", 14);
    }
    const boss = e.type === "boss";
    spawnParticles(e.x, e.y, e.def.color, boss ? 40 : 16, boss ? 240 : 140);
    spawnRing(e.x, e.y, e.def.color, boss ? 140 : 42, boss ? 0.7 : 0.4);
    if (boss) state.shake = Math.max(state.shake, 0.35);
    Sound.play(boss ? "boss_die" : "kill");
    updateHUD();
  }

  function projectileHit(p) {
    const t = p.target;
    if (!t || t.dead) { p.dead = true; return; }

    // Golpe fatal (fatal hit)
    if (p.type.fatal && Math.random() < p.type.fatal) {
      spawnFloater(t.x, t.y - t.radius, "FATAL!", "#ffd166", 20);
      Sound.play("fatal");
      t.hp = 0; killEnemy(t, p.type);
    } else if (p.type.splash) {
      // Dano em área
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (dist(e, t) <= p.type.splash) damageEnemy(e, p.damage, p.type);
      }
      spawnParticles(t.x, t.y, p.type.color, 16, 160);
    } else if (p.type.chain) {
      damageEnemy(t, p.damage, p.type);
      let prev = t, dmg = p.damage;
      for (let i = 0; i < p.type.chain; i++) {
        dmg *= p.type.chainDecay;
        let best = null, bestD = p.type.chainRange;
        for (const e of state.enemies) {
          if (e.dead || e === prev) continue;
          const d = dist(e, prev);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) break;
        damageEnemy(best, dmg, null);
        spawnParticles(best.x, best.y, p.type.color, 4, 40);
        prev = best;
      }
    } else {
      damageEnemy(t, p.damage, p.type);
    }
    p.dead = true;
  }

  // ===================================================================
  //  UPDATE
  // ===================================================================
  function update(dt, force) {
    if ((state.paused && !force) || state.gameOver) return;
    state.time += dt;
    const now = state.time;
    // decai o feedback de dano (tremor/vinheta)
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);
    // cooldown das habilidades ativas
    for (const k of ABILITY_ORDER) if (state.abilities[k] > 0) state.abilities[k] = Math.max(0, state.abilities[k] - dt);

    // --- spawn da onda ---
    if (state.running) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          // distribui os inimigos pelas entradas do mapa (round-robin)
          spawnEnemy(state.spawnQueue.shift(), state.spawnIx % PATHS.length);
          state.spawnIx++;
          state.spawnTimer = CONFIG.spawnDelay;
        }
      } else if (state.enemies.length === 0) {
        // onda concluída
        state.running = false;
        state.betweenTimer = CONFIG.timeBetweenWaves;
        if (!state.endless && state.wave >= levelWaves()) triggerVictory(); // → animação → modal
        updateHUD();
      }
    } else if (state.victoryPending) {
      // sequência de vitória: brilho saindo das torres antes de abrir o modal
      state.victoryTimer -= dt;
      state.victoryGlow = (state.victoryGlow || 0) - dt;
      if (state.victoryGlow <= 0 && state.towers.length) {
        const t = state.towers[(Math.random() * state.towers.length) | 0];
        spawnRing(t.x, t.y, "#ffd166", 70, 0.8);
        spawnParticles(t.x, t.y, "#ffd166", 8, 120);
        state.victoryGlow = 0.12;
        Sound.play("kill");
      }
      if (state.victoryTimer <= 0) { state.victoryPending = false; winGame(); }
    } else if (state.betweenTimer > 0 && state.wave > 0) {
      state.betweenTimer -= dt;
      if (state.betweenTimer <= 0) startWave();
    }

    // --- inimigos ---
    for (const e of state.enemies) {
      if (e.dead) continue;

      // slow expira
      if (e.slowUntil < now) e.slowFactor = 1;
      // burn
      if (e.burnUntil > now && e.burn > 0) {
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.4;
          damageEnemy(e, e.burn * 0.4, null);
        }
      }
      // veneno stackável
      if (e.poisons && e.poisons.length) {
        for (const p of e.poisons) {
          if (p.until <= now) continue;
          p.tick -= dt;
          if (p.tick <= 0) { p.tick = 0.4; damageEnemy(e, p.dps * 0.4, null); }
        }
        e.poisons = e.poisons.filter(p => p.until > now);
      }
      // stun: parado completamente
      if (e.stunUntil && e.stunUntil > now) continue;
      // curandeiro: restaura HP de inimigos próximos
      if (e.def.heal) {
        e.healTick -= dt;
        if (e.healTick <= 0) {
          e.healTick = e.def.healInterval;
          for (const o of state.enemies) {
            if (o === e || o.dead || o.hp >= o.maxHP) continue;
            if (dist(e, o) <= e.def.healRange) {
              o.hp = Math.min(o.maxHP, o.hp + e.def.heal);
              spawnFloater(o.x, o.y - o.radius, "+" + e.def.heal, "#94e2d5", 13);
            }
          }
        }
      }

      const speed = e.baseSpeed * e.slowFactor;
      // voadores vão direto ao torre; os demais seguem o caminho da sua entrada
      const P = PATHS[e.path] || PATHS[0];
      const tgt = e.def.flying ? CORE : P[e.wp];
      const d = dist(e, tgt);
      if (d <= speed * dt + 1) {
        if (e.def.flying || e.wp >= P.length - 1) {
          // chegou ao alvo final -> atacou a Torre Mestra
          e.dead = true;
          state.lives--;
          spawnParticles(CORE.x, CORE.y, "#ff6b81", 18, 160);
          spawnRing(CORE.x, CORE.y, "#ff6b81", 70, 0.5);
          spawnFloater(CORE.x, CORE.y - 40, "-1 ♥", "#ff6b81", 22);
          state.shake = 0.4;  // tremor + vinheta de dano
          state.flash = 0.6;
          buzz(30);
          Sound.play("leak");
          if (state.lives <= 0) { state.lives = 0; loseGame(); }
          updateHUD();
        } else {
          e.x = tgt.x; e.y = tgt.y;
          e.wp++;
        }
      } else {
        e.x += ((tgt.x - e.x) / d) * speed * dt;
        e.y += ((tgt.y - e.y) / d) * speed * dt;
      }
    }
    state.enemies = state.enemies.filter(e => !e.dead);

    // --- torres ---
    for (const tw of state.towers) towerFire(tw, dt);

    // --- projéteis (teleguiados) ---
    for (const p of state.projectiles) {
      if (p.dead) continue;
      const t = p.target;
      if (!t || t.dead) { p.dead = true; continue; }
      const d = dist(p, t);
      const step = p.speed * dt;
      if (d <= step) { projectileHit(p); }
      else { p.x += ((t.x - p.x) / d) * step; p.y += ((t.y - p.y) / d) * step; }
    }
    state.projectiles = state.projectiles.filter(p => !p.dead);

    // --- mecânica de território ---
    const mech = activeMechanic();
    if (mech) mech.update(state, dt);

    // --- partículas e textos ---
    for (const pt of state.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
    for (const f of state.floaters) { f.y += f.vy * dt; f.life -= dt; }
    state.floaters = state.floaters.filter(f => f.life > 0);
  }

  // ===================================================================
  //  RENDER
  // ===================================================================
  let pulse = 0;

  // ----- Câmera: zoom + deslocamento (pan) -----
  // O mundo é sempre 0..W × 0..H; a câmera mapeia mundo→tela. zoom=1 mostra o
  // mapa inteiro (encaixado no playfield); zoom>1 amplia e habilita o pan.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const view = { zoom: 1, panX: 0, panY: 0, cw: W, ch: H, dpr: 1 };

  // Escala e offset atuais, já com o pan limitado p/ não revelar fora do mapa.
  function camera() {
    const fit = Math.min(view.cw / W, view.ch / H);
    const scale = fit * view.zoom;
    const wpx = W * scale, hpx = H * scale;
    const ox = wpx <= view.cw ? (view.cw - wpx) / 2 : clamp(view.panX, view.cw - wpx, 0);
    const oy = hpx <= view.ch ? (view.ch - hpx) / 2 : clamp(view.panY, view.ch - hpx, 0);
    view.panX = ox; view.panY = oy;
    return { scale, ox, oy, fit };
  }
  // Ajusta o zoom mantendo o ponto de tela (fx,fy) fixo (foco da pinça/scroll).
  function zoomAt(newZoom, fx, fy) {
    const c0 = camera();
    const wx = (fx - c0.ox) / c0.scale, wy = (fy - c0.oy) / c0.scale;
    view.zoom = clamp(newZoom, 1, 3);
    const fit = Math.min(view.cw / W, view.ch / H);
    const scale = fit * view.zoom;
    view.panX = fx - wx * scale;
    view.panY = fy - wy * scale;
    camera();
    updateZoomUI();
  }
  function panBy(dx, dy) { view.panX += dx; view.panY += dy; camera(); }
  function zoomByFactor(f) { zoomAt(view.zoom * f, view.cw / 2, view.ch / 2); }
  function resetView() { view.zoom = 1; view.panX = 0; view.panY = 0; camera(); updateZoomUI(); }
  function updateZoomUI() {
    const out = document.getElementById("zoom-out");
    const ins = document.getElementById("zoom-in");
    if (out) out.disabled = view.zoom <= 1.001;
    if (ins) ins.disabled = view.zoom >= 2.999;
  }

  function render() {
    pulse += 0.04;
    const { scale, ox, oy } = camera();
    // tremor de tela ao tomar dano no torre
    const sh = state.shake > 0 ? state.shake * 16 : 0;
    const shx = sh ? (Math.random() * 2 - 1) * sh : 0;
    const shy = sh ? (Math.random() * 2 - 1) * sh : 0;
    // limpa a tela inteira (em px de tela) e aplica a transformação da câmera
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.cw, view.ch);
    ctx.save();
    ctx.translate(ox + shx, oy + shy);
    ctx.scale(scale, scale);

    // fundo / grade
    drawBackground();
    drawPath();
    drawNodes();
    drawCore();
    drawTowers();
    drawEnemies();
    drawProjectiles();
    drawParticles();
    drawFloaters();
    drawBuildPreview();
    const rmech = activeMechanic();
    if (rmech) rmech.draw(ctx, camera());
    ctx.restore();

    // vinheta vermelha de dano (em px de tela, por cima de tudo)
    if (state.flash > 0) {
      const a = Math.min(1, state.flash) * 0.55;
      const cx = view.cw / 2, cy = view.ch / 2;
      const g = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.55, cx, cy, Math.max(cx, cy) * 1.05);
      g.addColorStop(0, "rgba(255,0,40,0)");
      g.addColorStop(1, `rgba(255,0,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.cw, view.ch);
    }
  }

  function drawBackground() {
    const g = ctx.createRadialGradient(W / 2, H * 0.35, 80, W / 2, H * 0.4, W * 0.8);
    g.addColorStop(0, "#16203a");
    g.addColorStop(1, "#0b0f1a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(110,231,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function tracePath(P) {
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
  }
  function drawPath() {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // leito largo de cada caminho
    ctx.strokeStyle = "rgba(110,231,255,0.10)";
    ctx.lineWidth = 46;
    for (const P of PATHS) { ctx.beginPath(); tracePath(P); ctx.stroke(); }
    // linha tracejada animada por cima
    ctx.strokeStyle = "rgba(110,231,255,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.lineDashOffset = -pulse * 20;
    for (const P of PATHS) { ctx.beginPath(); tracePath(P); ctx.stroke(); }
    ctx.setLineDash([]);
    // marcador de entrada (portal pulsante) onde cada caminho entra na tela
    for (const P of PATHS) {
      const a = P[0];
      const px = Math.max(0, Math.min(1280, a.x));
      const py = Math.max(0, Math.min(720, a.y));
      const rr = 22 + Math.sin(pulse * 1.5) * 4;
      const g = ctx.createRadialGradient(px, py, 2, px, py, rr);
      g.addColorStop(0, "rgba(110,231,255,0.5)");
      g.addColorStop(1, "rgba(110,231,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawNodes() {
    for (const n of NODES) {
      if (n.taken) continue;
      const sel = state.selectedType;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = sel ? "rgba(110,231,255,0.18)" : "rgba(135,148,173,0.12)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = sel ? "rgba(110,231,255,0.8)" : "rgba(135,148,173,0.5)";
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = pulse * 10;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCore() {
    const r = 34 + Math.sin(pulse) * 2;
    const g = ctx.createRadialGradient(CORE.x, CORE.y, 5, CORE.x, CORE.y, r + 14);
    g.addColorStop(0, "#ffd166");
    g.addColorStop(0.5, "#ff9f6b");
    g.addColorStop(1, "rgba(255,107,129,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, r + 14, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#1d2740";
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#ffd166";
    ctx.stroke();

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 26px Segoe UI, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("♥ " + state.lives, CORE.x, CORE.y);
  }

  function drawTowers() {
    for (const tw of state.towers) {
      const t = tw.type;
      const selected = state.selectedTower === tw;

      if (selected) {
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, effRange(tw), 0, Math.PI * 2);
        ctx.fillStyle = t.color + "14";
        ctx.fill();
        ctx.strokeStyle = t.color + "88";
        ctx.lineWidth = 2; ctx.stroke();
      }

      // base
      ctx.beginPath(); ctx.arc(tw.x, tw.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = "#1d2740"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = t.color; ctx.stroke();

      // indicador de nível (pips)
      for (let i = 0; i < tw.level; i++) {
        ctx.beginPath();
        ctx.arc(tw.x - 6 + i * 6, tw.y + 22, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = t.color; ctx.fill();
      }

      // canhão apontando p/ alvo
      ctx.save();
      ctx.translate(tw.x, tw.y); ctx.rotate(tw.angle);
      ctx.fillStyle = t.color;
      ctx.fillRect(0, -4, 22, 8);
      ctx.restore();

      // esfera de energia
      const g = ctx.createRadialGradient(tw.x, tw.y, 1, tw.x, tw.y, 12);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, t.color);
      g.addColorStop(1, t.color + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(tw.x, tw.y, 11, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      // corpo
      const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, e.radius);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.5, e.def.color);
      g.addColorStop(1, e.def.color + "55");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();

      // voador: "asas" laterais
      if (e.def.flying) {
        ctx.strokeStyle = e.def.color; ctx.lineWidth = 2;
        const w = e.radius + 6 + Math.sin(pulse * 3) * 2;
        ctx.beginPath();
        ctx.moveTo(e.x - w, e.y); ctx.lineTo(e.x - e.radius, e.y);
        ctx.moveTo(e.x + e.radius, e.y); ctx.lineTo(e.x + w, e.y);
        ctx.stroke();
      }
      // curandeiro: aura de cura (cruz)
      if (e.def.heal) {
        ctx.strokeStyle = "rgba(148,226,213,0.5)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.healRange, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#94e2d5"; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(e.x - 5, e.y); ctx.lineTo(e.x + 5, e.y);
        ctx.moveTo(e.x, e.y - 5); ctx.lineTo(e.x, e.y + 5);
        ctx.stroke();
      }

      // efeito gélido
      if (e.slowFactor < 1) {
        ctx.strokeStyle = "#7ad7ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2); ctx.stroke();
      }
      // efeito burn
      if (e.burnUntil > state.time) {
        ctx.strokeStyle = "#ff9f6b"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2); ctx.stroke();
      }

      // barra de vida
      const bw = e.radius * 2.2, frac = Math.max(0, e.hp / e.maxHP);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw, 4);
      ctx.fillStyle = frac > 0.5 ? "#5ad16f" : frac > 0.25 ? "#ffd166" : "#ff6b81";
      ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw * frac, 4);
    }
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      ctx.fillStyle = p.type.color;
      ctx.shadowColor = p.type.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawParticles() {
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      if (pt.ring) {
        const r = pt.maxR * (1 - a) + 6;
        ctx.strokeStyle = pt.color; ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / 0.8);
      ctx.fillStyle = f.color;
      ctx.font = "bold " + f.size + "px Segoe UI, sans-serif";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBuildPreview() {
    if (!state.selectedType || !mouse.world) return;
    const node = nodeAt(mouse.world);
    const p = node || mouse.world;
    const t = state.selectedType;
    const ok = node && state.mana >= t.cost;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, t.range, 0, Math.PI * 2);
    ctx.fillStyle = (ok ? t.color : "#ff6b81") + "12"; ctx.fill();
    ctx.strokeStyle = (ok ? t.color : "#ff6b81") + "88"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = ok ? t.color : "#ff6b81"; ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ===================================================================
  //  LOOP
  // ===================================================================
  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.max(0, Math.min(dt, 0.05)); // clamp p/ evitar saltos / valores negativos
    for (let i = 0; i < state.speed; i++) update(dt);
    render();
    updateAbilities();
    requestAnimationFrame(loop);
  }

  // ===================================================================
  //  ENTRADA (mouse)
  // ===================================================================
  const mouse = { x: 0, y: 0, world: null };

  function toWorld(ev) {
    const rect = canvas.getBoundingClientRect();
    // posição em px de tela (CSS) dentro do canvas
    const px = (ev.clientX - rect.left) * (view.cw / rect.width);
    const py = (ev.clientY - rect.top) * (view.ch / rect.height);
    const { scale, ox, oy } = camera();
    return { x: (px - ox) / scale, y: (py - oy) / scale };
  }

  // posição do evento em px de tela (CSS) relativos ao canvas
  function toCanvasPx(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (view.cw / rect.width),
      y: (ev.clientY - rect.top) * (view.ch / rect.height),
    };
  }

  canvas.addEventListener("mousemove", (ev) => { mouse.world = toWorld(ev); });
  canvas.addEventListener("mouseleave", () => { mouse.world = null; });

  // Scroll do mouse = zoom centrado no cursor (desktop)
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const p = toCanvasPx(ev);
    zoomAt(view.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }, { passive: false });

  // Arrastar com o mouse = pan (apenas quando há zoom); senão é clique normal.
  let dragPan = null, suppressClick = false;
  canvas.addEventListener("mousedown", (ev) => {
    if (view.zoom > 1.001) dragPan = { x: ev.clientX, y: ev.clientY, moved: false };
  });
  window.addEventListener("mousemove", (ev) => {
    if (!dragPan) return;
    const dx = ev.clientX - dragPan.x, dy = ev.clientY - dragPan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragPan.moved = true;
    panBy(dx, dy);
    dragPan.x = ev.clientX; dragPan.y = ev.clientY;
  });
  window.addEventListener("mouseup", () => {
    if (dragPan && dragPan.moved) suppressClick = true;
    dragPan = null;
  });

  // Lógica de toque/clique no campo: construir no nó, ou selecionar torre.
  // No toque os alvos são maiores (dedo é menos preciso que o mouse).
  function handleTap(w, isTouch) {
    Sound.init(); Sound.resume();
    const nodeR = isTouch ? 40 : 26;
    const towerR = isTouch ? 34 : 22;

    // modo construção
    if (state.selectedType) {
      const node = nodeAt(w, nodeR);
      if (node) { tryBuild(node); return; }
    }

    // selecionar torre existente
    const tw = state.towers.find(t => dist(t, w) < towerR);
    if (tw) {
      state.selectedTower = tw;
      state.selectedType = null;
    } else {
      state.selectedTower = null;
    }
    updateTowerButtons();
    refreshShop();
  }

  // No mobile o touchstart usa preventDefault (anti-scroll/zoom), o que impede
  // o navegador de sintetizar o `click`. Por isso o toque é tratado no
  // `touchend`; este flag evita que um `click` sintetizado dispare em dobro.
  let lastTouchTap = 0;
  canvas.addEventListener("click", (ev) => {
    if (suppressClick) { suppressClick = false; return; } // foi um pan, não clique
    if (Date.now() - lastTouchTap < 600) return; // já tratado pelo touchend
    handleTap(toWorld(ev));
  });

  // botão direito cancela seleção
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    state.selectedType = null;
    state.selectedTower = null;
    updateTowerButtons();
    refreshShop();
  });

  // ----- Toque (mobile) -----
  //  1 dedo: preview ao arrastar, construir/selecionar ao soltar (tap).
  //  2 dedos: pinça = zoom, arrasto = pan. (não dispara tap)
  let touchStart = null;   // ponto-mundo do toque de 1 dedo (detecção de tap)
  let pinch = null;        // { d, z } estado inicial da pinça
  let panLast = null;      // último ponto-médio (px) p/ o pan de 2 dedos

  canvas.addEventListener("touchstart", (ev) => {
    if (ev.touches.length >= 2) {
      const a = toCanvasPx(ev.touches[0]), b = toCanvasPx(ev.touches[1]);
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.zoom };
      panLast = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      touchStart = null; mouse.world = null; // cancela qualquer tap
    } else if (ev.touches.length === 1) {
      pinch = null;
      mouse.world = toWorld(ev.touches[0]);
      touchStart = mouse.world;
    }
    ev.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (ev) => {
    if (ev.touches.length >= 2 && pinch) {
      const a = toCanvasPx(ev.touches[0]), b = toCanvasPx(ev.touches[1]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch.d > 0) zoomAt(pinch.z * (d / pinch.d), mx, my);
      if (panLast) panBy(mx - panLast.x, my - panLast.y);
      panLast = { x: mx, y: my };
    } else if (ev.touches.length === 1 && !pinch) {
      mouse.world = toWorld(ev.touches[0]);
    }
    ev.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (ev) => {
    ev.preventDefault();
    lastTouchTap = Date.now();
    if (ev.touches.length === 0) {
      if (!pinch) { // só conta como tap se não estava em pinça
        const t = ev.changedTouches[0];
        if (t) {
          const w = toWorld(t);
          if (!touchStart || dist(w, touchStart) <= 44) handleTap(w, true);
        }
      }
      pinch = null; panLast = null; touchStart = null; mouse.world = null;
    } else if (ev.touches.length === 1) {
      // saiu de 2→1 dedo: reinicia rastreio sem disparar tap
      pinch = null; panLast = null; touchStart = null;
      mouse.world = toWorld(ev.touches[0]);
    }
  }, { passive: false });

  // Preenche o painel da torre selecionada: nome, nível, stats efetivos
  // (já com nível + melhorias globais) e os botões de melhorar/vender.
  function updateTowerButtons() {
    const panel = document.getElementById("tower-panel");
    const shop = document.getElementById("shop");
    const tw = state.selectedTower;
    if (!tw) {
      panel.hidden = true;
      shop.classList.remove("inspecting");
      return;
    }
    panel.hidden = false;
    shop.classList.add("inspecting"); // no mobile, troca a lista de esferas pelo painel

    const t = tw.type;
    const dot = panel.querySelector(".tp-dot");
    dot.style.background = t.color;
    dot.style.color = t.color;
    panel.querySelector(".tp-name").textContent = t.name;
    panel.querySelector(".tp-level").textContent = `Nv. ${tw.level}/${CONFIG.maxLevel}`;

    const dmg = Math.round(effDamage(tw));
    const rng = Math.round(effRange(tw));
    const cd = effCooldown(tw);
    const dps = cd > 0 ? Math.round(dmg / cd) : dmg;
    panel.querySelector(".tp-stats").innerHTML =
      `<span>⚔ ${dmg} dano</span><span>◎ ${rng} alcance</span>` +
      `<span>⏱ ${cd.toFixed(2)}s</span><span>💥 ${dps} DPS</span>`;

    const tags = [];
    if (t.slow) tags.push("❄ lentidão");
    if (t.fatal) tags.push("💀 fatal");
    if (t.splash) tags.push("💥 área");
    if (t.burn) tags.push("🔥 queimadura");
    if (t.manaBonus) tags.push("✦ bônus de mana");
    const tagEl = panel.querySelector(".tp-tags");
    tagEl.textContent = tags.join("  ·  ");
    tagEl.hidden = tags.length === 0;

    // botões de prioridade de alvo (reconstruídos só quando muda a torre/modo)
    const modes = document.getElementById("tp-target-modes");
    const stamp = tw.node + "|" + tw.targetMode;
    if (modes.dataset.stamp !== stamp) {
      modes.dataset.stamp = stamp;
      modes.innerHTML = "";
      for (const key of TARGET_ORDER) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tp-mode" + (tw.targetMode === key ? " active" : "");
        b.textContent = TARGET_MODES[key].label;
        b.addEventListener("click", () => {
          tw.targetMode = key;
          tw.target = null;       // re-mira já no próximo quadro
          updateTowerButtons();
        });
        modes.appendChild(b);
      }
    }

    const sb = document.getElementById("sell-btn");
    const ub = document.getElementById("upgrade-btn");
    sb.textContent = `Vender (+${Math.round(tw.invested * 0.6)} ✦)`;
    if (tw.level >= CONFIG.maxLevel) {
      ub.disabled = true;
      ub.textContent = "Nível máximo";
    } else {
      const c = upgradeCost(tw);
      ub.disabled = state.mana < c;
      ub.textContent = `⬆ Melhorar p/ Nv.${tw.level + 1} (${c} ✦)`;
    }
  }

  // Atualiza os botões de habilidade (cooldown: texto + preenchimento radial).
  function updateAbilities() {
    for (const k of ABILITY_ORDER) {
      const btn = document.getElementById("ability-" + k);
      if (!btn) continue;
      const cd = state.abilities[k], max = ABILITIES[k].cd;
      btn.disabled = cd > 0 || state.gameOver;
      const cdEl = btn.querySelector(".cd");
      if (cdEl) cdEl.textContent = cd > 0 ? Math.ceil(cd) : "";
      // anel de progresso do cooldown via conic-gradient
      const pct = cd > 0 ? (1 - cd / max) * 100 : 100;
      btn.style.setProperty("--cd", pct + "%");
    }
  }

  // ===================================================================
  //  UI
  // ===================================================================
  function updateHUD() {
    document.getElementById("mana").textContent = Math.floor(state.mana);
    document.getElementById("lives").textContent = state.lives;
    const total = state.endless ? null : levelWaves();
    document.getElementById("wave").textContent = total ? state.wave + "/" + total : state.wave;
    document.getElementById("score").textContent = state.score;

    const status = document.getElementById("wave-status");
    if (state.gameOver) status.textContent = state.won ? "Vitória!" : "Fim de jogo";
    else if (state.running) status.textContent = `Onda ${state.wave} em andamento — inimigos: ${state.enemies.length + state.spawnQueue.length}`;
    else if (state.betweenTimer > 0) status.textContent = `Próxima onda em ${Math.ceil(state.betweenTimer)}s…`;
    else status.textContent = state.wave === 0 ? "Prepare suas defesas…" : "Onda concluída! Inicie a próxima.";

    const startBtn = document.getElementById("start-btn");
    startBtn.disabled = state.running || state.gameOver || state.victoryPending;
    startBtn.textContent = state.betweenTimer > 0 ? "▶ Pular espera" : "▶ Iniciar onda";
    if (state.selectedTower) updateTowerButtons();
    updateGlobals();
    updateWavePreview();
    refreshShop();
  }

  // Prévia da próxima onda: tipos e quantidades de inimigos que vêm a seguir.
  function updateWavePreview() {
    const el = document.getElementById("wave-preview");
    if (!el) return;
    const next = state.wave + 1;
    const lastWave = !state.endless && state.wave >= levelWaves();
    if (state.running || state.gameOver || lastWave) { el.hidden = true; return; }

    // conta inimigos por tipo, preservando a ordem de ENEMY_TYPES
    const counts = {};
    for (const id of buildWave(next)) counts[id] = (counts[id] || 0) + 1;
    const parts = Object.keys(ENEMY_TYPES)
      .filter(id => counts[id])
      .map(id => `<span class="wp-item" title="${ENEMY_TYPES[id].name}">${ENEMY_TYPES[id].icon}<b>${counts[id]}</b></span>`);

    el.innerHTML = `<span class="wp-title">Próxima onda ${next}</span>` + parts.join("");
    el.hidden = false;
  }

  // Atualiza os botões de melhorias globais (rótulo, custo, disponibilidade)
  function updateGlobals() {
    document.querySelectorAll(".global-btn").forEach((btn) => {
      const kind = btn.dataset.kind;
      const g = GLOBALS[kind];
      const cost = globalCost(kind);
      const icon = kind === "dmg" ? "⚔" : "◎";
      btn.textContent = `${icon} ${g.name} Nv.${state.globals[kind]} — ${cost} ✦`;
      btn.disabled = state.mana < cost;
      btn.style.borderColor = g.color + "66";
    });
  }

  function refreshShop() {
    const list = document.getElementById("shop-list");
    list.innerHTML = "";
    for (const t of getAvailableTowers()) {
      const card = document.createElement("div");
      card.className = "tower-card";
      if (state.selectedType === t) card.classList.add("selected");
      if (state.mana < t.cost) card.classList.add("cant");

      const tags = [];
      if (t.slow) tags.push("❄ slow");
      if (t.fatal) tags.push("💀 fatal");
      if (t.splash) tags.push("💥 área");
      if (t.burn) tags.push("🔥 burn");
      if (t.manaBonus) tags.push("✦ bônus");
      if (t.poison) tags.push("☠ veneno");
      if (t.stun) tags.push("❄ stun");
      if (t.chain) tags.push("⚡ cadeia");

      card.innerHTML = `
        <div class="row1">
          <span class="dot" style="background:${t.color};color:${t.color}"></span>
          <span class="name">${t.name}</span>
          <span class="cost">${t.cost} ✦</span>
        </div>
        <div class="desc">${t.desc}</div>
        <div class="stats">
          <span>⚔ ${t.damage}</span><span>◎ ${t.range}</span>
          <span>⏱ ${t.cooldown}s</span>${tags.length ? "<span>" + tags.join(" ") + "</span>" : ""}
        </div>`;
      card.addEventListener("click", () => {
        state.selectedType = (state.selectedType === t) ? null : t;
        state.selectedTower = null;
        updateTowerButtons();
        refreshShop();
        if (state.selectedType) advanceCoach(0);
      });
      list.appendChild(card);
    }
  }

  // ===================================================================
  //  FIM DE JOGO
  // ===================================================================
  let pendingScore = null; // { score, wave, won } aguardando salvar no leaderboard

  let lastResult = { stars: 0, level: null };

  function loseGame() {
    state.gameOver = true; state.won = false; state.running = false;
    Sound.play("lose");
    if (isFree()) {
      lastResult = { stars: 0, level: null, mode: "free" };
      showOverlay("Derrota", `Sua Torre caiu na <b>onda ${state.wave}</b>.`,
        `★ ${state.score} pontos`, true);
      return;
    }
    const lv = levelById(activeLevel);
    Progress.record(lv.id, state.score, 0);
    lastResult = { stars: 0, level: lv, mode: "campaign" };
    showOverlay("💀 Derrota", `Sua Torre caiu na <b>onda ${state.wave}</b>.`,
      `★ ${state.score} pontos`, true);
  }
  // Dispara a sequência animada de vitória (brilho no mapa) antes do modal.
  function triggerVictory() {
    if (state.gameOver || state.victoryPending) return;
    state.victoryPending = true;
    state.running = false;
    state.betweenTimer = 0;
    state.victoryTimer = 1.4;
    state.victoryGlow = 0;
    state.shake = Math.max(state.shake, 0.25);
    Sound.play("win");
    for (const t of state.towers) spawnRing(t.x, t.y, "#ffd166", 60, 0.9);
    spawnRing(CORE.x, CORE.y, "#ffd166", 220, 1.3);
  }

  // Pontuação final = mortes + bônus por vidas restantes (invicto) + rapidez.
  const SPEED_PER_SEC = 8; // pontos por segundo abaixo do par (cada segundo conta)
  function finalizeScore() {
    const kills = state.score;
    const livesBonus = state.lives * 40;                 // sobreviver/invicto vale muito
    // mesmo "par" da estrela ⚡ Rápido: dentro do par rende pontos E a estrela.
    const lv = isFree() ? null : levelById(activeLevel);
    const par = lv ? lv.par : (levelWaves() + 1) * 26;
    const speedBonus = Math.max(0, Math.round((par - state.time) * SPEED_PER_SEC));
    const total = kills + livesBonus + speedBonus;
    return { kills, livesBonus, speedBonus, total };
  }

  function winGame() {
    if (state.gameOver) return;
    state.gameOver = true; state.won = true; state.running = false; state.victoryPending = false;
    Sound.play("win");
    const b = finalizeScore();
    state.score = b.total; // placar final consolidado
    const lv = isFree() ? null : levelById(activeLevel);
    const flawless = state.lives >= state.maxLives;            // não vazou nenhuma vida
    const fast = !!lv && state.time <= (lv.par || Infinity);   // limpou dentro do tempo "rápido"
    const stars = lv ? starsForResult(true, flawless, fast) : 0;
    if (lv) Progress.record(lv.id, b.total, stars);
    lastResult = { stars, level: lv, mode: isFree() ? "free" : "campaign", breakdown: b, flawless, fast };
    const title = isFree() ? "Vitória!" : "Fase concluída!";
    const msg = isFree()
      ? `Você sobreviveu às <b>${CONFIG.totalWaves} ondas</b>!`
      : `Fase ${lv.id} — <b>${lv.name}</b>`;
    showOverlay(title, msg, b, true);
    updateHUD();
  }

  let lastShareText = "";

  // Mostra os stats do resultado: string simples (derrota) ou breakdown animado (vitória).
  const shareIcon = `<button class="share-mini" title="Compartilhar resultado" aria-label="Compartilhar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></button>`;
  function renderResultStats(stats) {
    const el = document.getElementById("overlay-stats");
    if (!stats) { el.innerHTML = ""; return; }
    if (typeof stats === "string") {
      el.innerHTML = `<div class="lose-stat"><span>${stats}</span>${shareIcon}</div>`;
    } else {
      const b = stats; // { kills, livesBonus, speedBonus, total }
      el.innerHTML =
        `<div class="score-row"><span>Mortes</span><b data-v="${b.kills}">0</b></div>` +
        `<div class="score-row"><span>Bônus de vidas</span><b data-v="${b.livesBonus}" data-plus="1">+0</b></div>` +
        `<div class="score-row"><span>Bônus de rapidez</span><b data-v="${b.speedBonus}" data-plus="1">+0</b></div>` +
        `<div class="score-total"><span>Total</span><span class="total-val"><b data-v="${b.total}">0</b>${shareIcon}</span></div>`;
      // cada número sobe (cascata), o total por último — juice
      el.querySelectorAll("b[data-v]").forEach((bEl, i) => {
        const target = +bEl.dataset.v, plus = bEl.dataset.plus ? "+" : "";
        const t0 = performance.now() + i * 110, dur = 600;
        (function tick(now) {
          const k = Math.max(0, Math.min(1, (now - t0) / dur));
          bEl.textContent = plus + Math.round(target * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(tick);
        })(performance.now());
      });
    }
    const mini = el.querySelector(".share-mini");
    if (mini) mini.addEventListener("click", (e) => shareResult(e.currentTarget));
  }

  function showOverlay(title, msg, stats, isResult) {
    const ov = document.getElementById("overlay");
    ov.querySelector("h1").textContent = title;
    document.getElementById("overlay-msg").innerHTML = msg;
    // emblema (troféu na vitória, caveira na derrota) — só no resultado
    const emblem = document.getElementById("result-emblem");
    emblem.textContent = isResult ? (state.won ? "🏆" : "💀") : "";
    emblem.hidden = !isResult;
    renderResultStats(stats);
    document.getElementById("overlay-btn").textContent =
      isResult ? (lastResult.mode === "free" ? "🎮 Modo Livre" : "🗺 Mapa de fases") : "Jogar";

    // estado visual: menu × resultado (vitória/derrota)
    ov.classList.toggle("result", !!isResult);
    ov.classList.toggle("win", !!isResult && state.won);
    ov.classList.toggle("lose", !!isResult && !state.won);

    // estrelas conquistadas (só em vitória)
    const starsEl = document.getElementById("result-stars");
    if (isResult && state.won) {
      const n = lastResult.stars;
      starsEl.innerHTML = [1, 2, 3].map((i) => `<span class="${i <= n ? "on" : ""}">★</span>`).join("");
      starsEl.hidden = false;
    } else {
      starsEl.hidden = true;
    }

    // selos de desempenho (Invicto / Rápido)
    const flagsEl = document.getElementById("result-flags");
    if (isResult && state.won && lastResult.mode === "campaign") {
      const fl = lastResult.flawless, fa = lastResult.fast;
      flagsEl.innerHTML =
        `<span class="flag ${fl ? "on" : ""}">🛡 Invicto</span>` +
        `<span class="flag ${fa ? "on" : ""}">⚡ Rápido</span>`;
      flagsEl.hidden = false;
    } else {
      flagsEl.hidden = true;
    }

    // "Próxima fase": só em vitória de campanha com a fase seguinte já desbloqueada
    const nextBtn = document.getElementById("next-level-btn");
    let nextId = null;
    if (isResult && state.won && lastResult.mode === "campaign") {
      const nid = (lastResult.level ? lastResult.level.id : activeLevel) + 1;
      const tLvs = territoryLevels(activeTerritory);
      if (tLvs.some((l) => l.id === nid) && Progress.unlocked(nid, activeTerritory)) nextId = nid;
    }
    if (nextId) { nextBtn.dataset.next = String(nextId); nextBtn.hidden = false; }
    else nextBtn.hidden = true;

    // "Repetir fase": em qualquer resultado de campanha (rejogar a fase atual)
    document.getElementById("replay-btn").hidden = !(isResult && lastResult.mode === "campaign" && lastResult.level);

    // texto do compartilhamento (o gatilho agora é o ícone mini no detalhamento)
    if (isResult) {
      const lv = lastResult.level;
      lastShareText = lastResult.mode === "free"
        ? `Overhead 🏰 — Modo Livre: onda ${state.wave} (${state.score} pts)!`
        : (state.won
          ? `Overhead 🏰 — ${lastResult.stars}★ na fase ${lv ? lv.id : "?"} (${state.score} pts)!`
          : `Overhead 🏰 — caí na onda ${state.wave} (${state.score} pts).`);
    }

    pendingScore = null;
    document.getElementById("save-row").hidden = true;
    renderLeaderboard();
    renderBest();
    ov.classList.add("show");
    updateHUD();
  }

  function renderBest() {
    const el = document.getElementById("best");
    const total = Progress.totalStarsAll(), max = ALL_LEVELS.length * 3;
    if (total <= 0) { el.innerHTML = ""; return; }
    el.innerHTML =
      `<button id="best-chip" class="best-chip" aria-expanded="false">⭐ ${total}/${max} <span class="best-i">ⓘ</span></button>` +
      `<div id="best-info" class="best-info" hidden>` +
      `Estrelas por fase: <b>★</b> vencer · <b>★★</b> invicto <i>ou</i> rápido · <b>★★★</b> invicto <i>e</i> rápido.</div>`;
    const chip = document.getElementById("best-chip"), info = document.getElementById("best-info");
    chip.addEventListener("click", () => {
      const open = info.hidden;
      info.hidden = !open;
      chip.setAttribute("aria-expanded", String(open));
    });
  }

  function renderLeaderboard(highlightDate) {
    const el = document.getElementById("leaderboard");
    const list = [];
    if (list.length === 0) { el.innerHTML = ""; return; } // ranking agora é por fase (no mapa)
    let rows = "";
    list.forEach((e, i) => {
      const hl = e.date === highlightDate ? " class=\"hl\"" : "";
      rows += `<tr${hl}><td>${i + 1}</td><td class="lb-name">${escapeHTML(e.name)}</td>` +
              `<td>${e.won ? "🏆" : "Onda " + e.wave}</td><td class="lb-score">${e.score}</td></tr>`;
    });
    el.innerHTML = `<h3>🏅 Melhores pontuações</h3><table>${rows}</table>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ===================================================================
  //  BOTÕES
  // ===================================================================
  document.getElementById("start-btn").addEventListener("click", () => {
    if (state.betweenTimer > 0) { state.betweenTimer = 0; startWave(); }
    else startWave();
  });

  document.getElementById("sell-btn").addEventListener("click", () => {
    if (state.selectedTower) sellTower(state.selectedTower);
  });

  document.getElementById("upgrade-btn").addEventListener("click", () => {
    if (state.selectedTower) upgradeTower(state.selectedTower);
  });

  document.getElementById("tp-close").addEventListener("click", () => {
    state.selectedTower = null;
    updateTowerButtons();
    refreshShop();
  });

  document.getElementById("pause-btn").addEventListener("click", () => {
    if (state.gameOver) return;
    setPaused(!state.paused); // abre/fecha o menu de pausa
  });

  document.getElementById("speed-btn").addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
    document.getElementById("speed-btn").textContent = state.speed + "×";
    Prefs.set("speed", state.speed);
  });

  document.getElementById("zoom-in").addEventListener("click", () => zoomByFactor(1.3));
  document.getElementById("zoom-out").addEventListener("click", () => zoomByFactor(1 / 1.3));
  document.getElementById("zoom-reset").addEventListener("click", () => resetView());

  document.getElementById("ability-freeze").addEventListener("click", () => { Sound.init(); Sound.resume(); activateAbility("freeze"); });
  document.getElementById("ability-storm").addEventListener("click", () => { Sound.init(); Sound.resume(); activateAbility("storm"); });

  document.getElementById("sound-btn").addEventListener("click", () => {
    Sound.init();
    const on = Sound.toggle();
    document.getElementById("sound-btn").textContent = on ? "🔊" : "🔇";
    Prefs.set("sound", on);
  });

  // botões de melhorias globais (ralo de mana)
  document.querySelectorAll(".global-btn").forEach((btn) => {
    btn.addEventListener("click", () => { buyGlobal(btn.dataset.kind); });
  });

  // modo infinito (checkbox do menu)
  document.getElementById("endless-check").addEventListener("change", (e) => {
    Prefs.set("endless", e.target.checked);
  });

  // seletor de dificuldade (segmented control no menu)
  function renderDifficulty() {
    const cur = Prefs.get("difficulty") || "normal";
    const box = document.getElementById("difficulty-modes");
    box.innerHTML = "";
    for (const key of DIFFICULTY_ORDER) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (cur === key ? " active" : "");
      b.textContent = DIFFICULTIES[key].label;
      b.addEventListener("click", () => { Prefs.set("difficulty", key); renderDifficulty(); });
      box.appendChild(b);
    }
  }
  renderDifficulty();

  // seletor de mapa (Modo Livre) — a campanha escolhe o mapa pela fase
  function renderMaps() {
    const box = document.getElementById("map-modes");
    if (!box) return;
    const cur = Prefs.get("map") || "serpent";
    box.innerHTML = "";
    for (const m of territoryMaps(activeTerritory)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (cur === m.id ? " active" : "");
      b.textContent = m.name;
      b.addEventListener("click", () => { Prefs.set("map", m.id); renderMaps(); });
      box.appendChild(b);
    }
  }
  renderMaps();

  // ----- Mapa de fases (campanha) -----
  const starRow = (n) => `<span class="lv-stars">` +
    [1, 2, 3].map((i) => `<span class="${i <= n ? "on" : ""}">★</span>`).join("") + `</span>`;
  // próxima fase a jogar: 1ª desbloqueada ainda sem 3★ (destaque "atual")
  function currentLevelId() {
    const lvs = territoryLevels(activeTerritory);
    for (const lv of lvs) {
      if (Progress.unlocked(lv.id, activeTerritory) && Progress.get(lv.id, activeTerritory).stars < 3) return lv.id;
    }
    return null;
  }
  function renderTerritoryTabs() {
    const tabs = document.getElementById("territory-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    for (const t of TERRITORIES) {
      const btn = document.createElement("button");
      btn.type = "button";
      const open = Progress.territoryOpen(t.id);
      btn.className = "territory-tab" + (t.id === activeTerritory ? " active" : "") + (open ? "" : " locked");
      btn.style.setProperty("--t-color", t.color);
      const stars = Progress.totalStars(t.id);
      btn.innerHTML = open
        ? `<span class="tt-name">${t.name}</span><span class="tt-stars">⭐ ${stars}/${t.levels.length * 3}</span>`
        : `<span class="tt-name">🔒 ${t.name}</span><span class="tt-stars">${t.unlockStars}★</span>`;
      if (open) btn.addEventListener("click", () => { activeTerritory = t.id; renderLevels(); });
      tabs.appendChild(btn);
    }
  }
  function renderLevels() {
    renderTerritoryTabs();
    const list = document.getElementById("levels-list");
    list.innerHTML = "";
    const terr = territoryById(activeTerritory);
    list.style.setProperty("--t-color", terr.color);
    const lvs = territoryLevels(activeTerritory);
    const tStars = Progress.totalStars(activeTerritory);
    document.getElementById("levels-total").textContent = `⭐ ${tStars}/${lvs.length * 3}`;
    const curId = currentLevelId();
    for (const lv of lvs) {
      const open = Progress.unlocked(lv.id, activeTerritory);
      const p = Progress.get(lv.id, activeTerritory);
      const card = document.createElement(open ? "button" : "div");
      card.className = "level-card" + (open ? "" : " locked") + (lv.id === curId ? " current" : "");
      const badge = lv.tutorial ? `<span class="lv-badge">Tutorial</span>` : "";
      const meta = open
        ? (p.best > 0 ? "Melhor: " + p.best + " pts" : lv.intro)
        : `🔒 Requer ${lv.reqStars}★`;
      card.innerHTML =
        `<span class="lv-num">${lv.id}</span>` +
        `<span class="lv-info"><span class="lv-name">${lv.name}${badge}</span>` +
        `<span class="lv-meta">${meta}</span></span>` +
        (open ? starRow(p.stars) : `<span class="lv-lock">🔒</span>`);
      if (open) card.addEventListener("click", () => openLevelIntro(lv.id));
      list.appendChild(card);
    }
  }
  function openLevels() { renderLevels(); document.getElementById("levels").classList.add("show"); }

  // ----- Telinha de introdução da fase (história + o que esperar) -----
  function mapEntrances(mapId) { const m = MAPS.find((x) => x.id === mapId); return m && m.paths ? m.paths.length : 1; }
  function openLevelIntro(id) {
    const lv = levelById(id);
    const m = MAPS.find((x) => x.id === lv.mapId);
    const ent = mapEntrances(lv.mapId);
    const icons = ["grunt", ...(lv.enemies || []), ...(lv.boss ? ["boss"] : [])]
      .map((t) => ENEMY_TYPES[t].icon).join(" ");
    document.getElementById("li-num").textContent = "Fase " + lv.id + (lv.tutorial ? " · Tutorial" : "");
    document.getElementById("li-name").textContent = lv.name;
    document.getElementById("li-story").textContent = lv.intro;
    document.getElementById("li-chips").innerHTML =
      `<span class="li-chip">🗺 ${m ? m.name : ""}</span>` +
      `<span class="li-chip">${ent > 1 ? "⚔ " + ent + " entradas" : "→ 1 entrada"}</span>` +
      `<span class="li-chip">${icons}</span>`;
    const ov = document.getElementById("level-intro");
    ov.dataset.level = String(id);
    document.getElementById("levels").classList.remove("show");
    ov.classList.add("show");
  }
  document.getElementById("li-start").addEventListener("click", () => {
    const id = +document.getElementById("level-intro").dataset.level || 1;
    document.getElementById("level-intro").classList.remove("show");
    startLevel(id);
  });
  document.getElementById("li-back").addEventListener("click", () => {
    document.getElementById("level-intro").classList.remove("show");
    openLevels();
  });
  function startLevel(id, tid) {
    Sound.init();
    gameMode = "campaign";
    if (tid) activeTerritory = tid;
    activeLevel = id;
    Prefs.set("map", levelById(id).mapId);
    document.getElementById("levels").classList.remove("show");
    beginGame(false);
    // guia: aparece na fase de tutorial enquanto ela não foi vencida, ou na 1ª jogada
    const lv = levelById(id);
    if ((lv.tutorial && !Progress.get(id).best) || !Prefs.get("seenTutorial")) showCoach();
  }

  // ----- Modo Livre: dificuldade + mapa + infinito, fora da campanha -----
  function beginFreeGame() {
    gameMode = "free";
    document.getElementById("free-sheet").classList.remove("show");
    beginGame(document.getElementById("endless-check").checked);
  }
  function renderFreeTerritory() {
    const box = document.getElementById("free-territory-modes");
    if (!box) return;
    box.innerHTML = "";
    for (const t of TERRITORIES) {
      const open = Progress.territoryOpen(t.id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (activeTerritory === t.id ? " active" : "");
      b.disabled = !open;
      b.textContent = open ? t.name : "🔒 " + t.name;
      b.addEventListener("click", () => { activeTerritory = t.id; renderFreeTerritory(); renderMaps(); });
      box.appendChild(b);
    }
  }
  function openFreeSheet() {
    renderFreeTerritory();
    renderDifficulty();
    renderMaps();
    document.getElementById("endless-check").checked = !!Prefs.get("endless");
    openSheet("free-sheet");
  }

  // controles de áudio (volume + música)
  document.getElementById("volume-slider").addEventListener("input", (e) => {
    Sound.init();
    const v = (+e.target.value) / 100;
    Sound.setVolume(v);
    Prefs.set("volume", v);
  });
  document.getElementById("music-toggle").addEventListener("click", () => {
    Sound.init(); Sound.resume();
    const on = !Sound.isMusicOn();
    Sound.setMusic(on);
    Prefs.set("music", on);
    document.getElementById("music-toggle").classList.toggle("active", on);
  });

  // ----- Bestiário -----
  let bestiaryTerritory = "reino";
  function renderBestiaryTabs() {
    const tabs = document.getElementById("bestiary-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    for (const t of TERRITORIES) {
      const open = Progress.territoryOpen(t.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "territory-tab" + (t.id === bestiaryTerritory ? " active" : "") + (open ? "" : " locked");
      btn.style.setProperty("--t-color", t.color);
      btn.textContent = open ? t.name : "🔒";
      if (open) btn.addEventListener("click", () => { bestiaryTerritory = t.id; renderBestiary(); });
      tabs.appendChild(btn);
    }
  }
  function renderBestiary() {
    renderBestiaryTabs();
    const list = document.getElementById("bestiary-list");
    list.innerHTML = "";
    const enemies = territoryEnemies(bestiaryTerritory);
    for (const id of Object.keys(enemies)) {
      const e = enemies[id];
      const tags = [`HP ×${e.hpMul}`, `Vel ×${e.speedMul}`, `✦ ${e.reward}`];
      if (e.flying) tags.push("voa");
      if (e.heal) tags.push("cura");
      const row = document.createElement("div");
      row.className = "bestiary-row";
      row.innerHTML =
        `<span class="be-icon" style="color:${e.color}">${e.icon}</span>` +
        `<div class="be-info"><div class="be-name">${e.name}</div>` +
        `<div class="be-desc">${e.desc}</div>` +
        `<div class="be-tags">${tags.join(" · ")}</div></div>`;
      list.appendChild(row);
    }
  }
  // ----- Bottom sheets (Opções / Como jogar / Bestiário) -----
  function openSheet(id) {
    const s = document.getElementById(id);
    if (id === "bestiary") renderBestiary();
    s.classList.add("show");
  }
  function closeSheet(s) { s.classList.remove("show"); }
  document.getElementById("options-btn").addEventListener("click", () => openSheet("options-sheet"));
  document.getElementById("howto-btn").addEventListener("click", () => openSheet("howto-sheet"));
  document.getElementById("bestiary-btn").addEventListener("click", () => openSheet("bestiary"));
  // fechar: botão [data-close] ou toque no fundo (fora do painel).
  // No menu de pausa, fechar = continuar (precisa despausar o jogo).
  function dismissSheet(sheet) {
    if (sheet.id === "pause-menu") setPaused(false);
    else closeSheet(sheet);
  }
  document.querySelectorAll(".sheet").forEach((sheet) => {
    sheet.addEventListener("click", (ev) => {
      if (ev.target === sheet || ev.target.closest("[data-close]")) dismissSheet(sheet);
    });
  });

  // Arrastar pra baixo a partir do topo (o "puxador") fecha o sheet — gesto de app.
  document.querySelectorAll(".sheet").forEach((sheet) => {
    const panel = sheet.querySelector(".panel");
    if (!panel) return;
    let startY = 0, dy = 0, dragging = false;
    panel.addEventListener("pointerdown", (ev) => {
      if (panel.scrollTop > 0) return;                                  // só no topo do scroll
      if (ev.clientY - panel.getBoundingClientRect().top > 60) return;  // só na faixa do puxador
      if (ev.target.closest("button, input, a, label, [data-close]")) return; // não rouba controles
      dragging = true; startY = ev.clientY; dy = 0;
      panel.style.transition = "none";
      panel.style.touchAction = "none";
      try { panel.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    panel.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      dy = Math.max(0, ev.clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = "";
      panel.style.transform = "";
      panel.style.touchAction = "";
      if (dy > 90) dismissSheet(sheet);   // arrastou o suficiente → fecha
    };
    panel.addEventListener("pointerup", finish);
    panel.addEventListener("pointercancel", finish);
  });

  document.getElementById("save-btn").addEventListener("click", () => {
    if (!pendingScore) return;
    const name = document.getElementById("name-input").value;
    const entry = Leaderboard.add(name, pendingScore.score, pendingScore.wave, pendingScore.won);
    pendingScore = null;
    document.getElementById("save-row").hidden = true;
    renderLeaderboard(entry.date);
    Sound.play("upgrade");
  });

  async function shareResult(iconEl) {
    const text = lastShareText || "Overhead 🏰 — tower defense web!";
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Overhead", text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        if (iconEl) { iconEl.classList.add("copied"); iconEl.title = "Copiado!"; setTimeout(() => { iconEl.classList.remove("copied"); iconEl.title = "Compartilhar resultado"; }, 1500); }
      }
    } catch (e) { /* usuário cancelou o compartilhamento — ignora */ }
  }

  // Inicia uma partida do zero (usado pelo menu e pelo "Reiniciar fase").
  function beginGame(endless) {
    // campanha não tem dificuldade (sempre "normal" + ajuste de HP por fase);
    // a dificuldade só vale no Modo Livre.
    state.difficulty = gameMode === "free" ? (Prefs.get("difficulty") || "normal") : "normal";
    applyMap(Prefs.get("map") || "serpent");                // carrega o mapa escolhido
    newGame();
    resetView();
    for (const n of NODES) n.taken = false;
    state.endless = endless;
    const mech = activeMechanic();
    if (mech) mech.init(state);
    state.speed = Prefs.get("speed") || 1;
    state.paused = false;
    pendingScore = null;
    document.getElementById("save-row").hidden = true;
    document.getElementById("overlay").classList.remove("show", "result", "win", "lose");
    document.getElementById("pause-menu").classList.remove("show");
    updateTowerButtons();
    document.getElementById("pause-btn").textContent = "❚❚";
    document.getElementById("speed-btn").textContent = state.speed + "×";
    updateHUD();
  }

  // "Jogar" (menu) e "Mapa de fases" (resultado) abrem o mapa de fases;
  // no resultado do Modo Livre, reabre o painel do Modo Livre.
  document.getElementById("overlay-btn").addEventListener("click", () => {
    Sound.init();
    const ov = document.getElementById("overlay");
    if (ov.classList.contains("result") && lastResult.mode === "free") openFreeSheet();
    else openLevels();
  });
  // Botões do Modo Livre
  document.getElementById("free-btn").addEventListener("click", () => { Sound.init(); openFreeSheet(); });
  document.getElementById("free-play").addEventListener("click", () => { Sound.init(); beginFreeGame(); });
  // "Próxima fase" (resultado de vitória) inicia direto a fase seguinte
  document.getElementById("next-level-btn").addEventListener("click", () => {
    Sound.init();
    const nid = +document.getElementById("next-level-btn").dataset.next;
    if (nid) openLevelIntro(nid);
  });
  // "Repetir fase" (resultado) reinicia a fase atual direto
  document.getElementById("replay-btn").addEventListener("click", () => {
    Sound.init();
    startLevel((lastResult.level && lastResult.level.id) || activeLevel);
  });

  // ----- Menu de pausa: continuar / reiniciar / menu principal -----
  function setPaused(p) {
    state.paused = p;
    document.getElementById("pause-menu").classList.toggle("show", p);
    document.getElementById("pause-btn").textContent = p ? "▶" : "❚❚";
  }
  document.getElementById("resume-btn").addEventListener("click", () => setPaused(false));
  document.getElementById("restart-btn").addEventListener("click", () => {
    Sound.init();
    beginGame(state.endless); // mantém o modo (infinito ou não)
  });
  document.getElementById("menu-btn").addEventListener("click", () => {
    setPaused(false);
    showMenu();
  });

  // Volta para o menu principal (sem resultado), com o jogo congelado atrás.
  function showMenu() {
    const ov = document.getElementById("overlay");
    ov.classList.remove("result", "win", "lose");
    ov.querySelector("h1").textContent = "OVERHEAD";
    document.getElementById("overlay-msg").innerHTML =
      "Você é o Bruxo. Defenda sua Torre dos cavaleiros do reino.<br />Erga esferas, derrote os invasores e proteja a princesa.";
    document.getElementById("overlay-btn").textContent = "Jogar";
    document.getElementById("share-btn").hidden = true;
    document.getElementById("next-level-btn").hidden = true;
    document.getElementById("replay-btn").hidden = true;
    document.getElementById("save-row").hidden = true;
    pendingScore = null;
    renderLeaderboard();
    renderBest();
    state.paused = true; // congela a partida atual atrás do menu
    ov.classList.add("show");
  }

  // ----- Coach de primeira jogada (tutorial passo a passo) -----
  let coachStep = 0;
  const COACH_STEPS = [
    { text: "Escolha uma esfera na loja →", highlight: "#shop-list" },
    { text: "Toque num nó azul do mapa para construí-la", highlight: "#canvas" },
    { text: "Inicie a onda e defenda sua Torre!", highlight: "#start-btn" },
  ];
  function updateCoachStep() {
    const el = document.getElementById("coach");
    if (el.hidden) return;
    if (coachStep >= COACH_STEPS.length) { dismissCoach(); return; }
    const step = COACH_STEPS[coachStep];
    const card = el.querySelector(".coach-card");
    const stepText = card.querySelector(".coach-step");
    if (stepText) {
      stepText.textContent = step.text;
    } else {
      const p = document.createElement("p");
      p.className = "coach-step";
      p.textContent = step.text;
      const ok = card.querySelector("#coach-ok");
      card.insertBefore(p, ok);
    }
    const counter = card.querySelector(".coach-counter") || (() => {
      const s = document.createElement("span");
      s.className = "coach-counter";
      const ok = card.querySelector("#coach-ok");
      card.insertBefore(s, ok);
      return s;
    })();
    counter.textContent = `Passo ${coachStep + 1} de ${COACH_STEPS.length}`;
    document.querySelectorAll(".coach-highlight").forEach((e) => e.classList.remove("coach-highlight"));
    if (step.highlight) {
      const target = document.querySelector(step.highlight);
      if (target) target.classList.add("coach-highlight");
    }
  }
  function advanceCoach(toStep) {
    if (document.getElementById("coach").hidden) return;
    if (toStep !== coachStep) return;
    coachStep++;
    updateCoachStep();
  }
  function showCoach() {
    coachStep = 0;
    const el = document.getElementById("coach");
    el.hidden = false;
    const ol = el.querySelector("ol");
    if (ol) ol.hidden = true;
    updateCoachStep();
  }
  function dismissCoach() {
    document.getElementById("coach").hidden = true;
    document.querySelectorAll(".coach-highlight").forEach((e) => e.classList.remove("coach-highlight"));
    Prefs.set("seenTutorial", true);
  }
  document.getElementById("coach-ok").addEventListener("click", dismissCoach);
  document.getElementById("coach-close").addEventListener("click", dismissCoach);

  // teclado
  window.addEventListener("keydown", (e) => {
    if (e.key === " ") { e.preventDefault(); document.getElementById("start-btn").click(); }
    if (e.key === "p" || e.key === "P") document.getElementById("pause-btn").click();
    if (e.key === "u" || e.key === "U") { if (state.selectedTower) upgradeTower(state.selectedTower); }
    if (e.key === "Escape") { state.selectedType = null; state.selectedTower = null; updateTowerButtons(); refreshShop(); }
    if (e.key >= "1" && e.key <= String(Math.min(9, getAvailableTowers().length))) {
      const t = getAvailableTowers()[+e.key - 1];
      if (t) { state.selectedType = (state.selectedType === t) ? null : t; state.selectedTower = null; updateTowerButtons(); refreshShop(); }
    }
  });

  // ===================================================================
  //  RESIZE / INIT
  // ===================================================================
  // Mede o #playfield (preenche o espaço restante em qualquer layout:
  // loja à direita no desktop, ou loja embaixo no mobile) e escala o canvas.
  function resize() {
    const pf = document.getElementById("playfield");
    const availW = pf.clientWidth;
    const availH = pf.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    // o canvas preenche todo o playfield; o "encaixe" do mapa vira escala da
    // câmera (assim sobra menos margem preta e o pan/zoom usam a área toda).
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.cw = availW; view.ch = availH; view.dpr = dpr;
    canvas.width = Math.round(availW * dpr);
    canvas.height = Math.round(availH * dpr);
    canvas.style.width = availW + "px";
    canvas.style.height = availH + "px";
    camera(); // re-limita o pan ao novo tamanho
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  // Reescala algumas vezes após o load para pegar o layout já estabilizado
  [0, 60, 200, 500].forEach(d => setTimeout(resize, d));

  // ===================================================================
  //  DEBUG / TEST API — usado pelos testes e2e. Não altera o jogo normal;
  //  apenas expõe hooks de leitura e controle determinístico.
  // ===================================================================
  window.__OVERHEAD = {
    version: 1,
    config: () => JSON.parse(JSON.stringify(CONFIG)),
    towerTypes: () => getAvailableTowers().map(t => ({ id: t.id, name: t.name, cost: t.cost })),
    nodeCount: () => NODES.length,
    nodes: () => NODES.map((n, i) => ({ i, x: n.x, y: n.y, taken: !!n.taken })),
    freeNodes: () => NODES.map((n, i) => (n.taken ? -1 : i)).filter(i => i >= 0),

    // controle de partida
    reset: () => {
      gameMode = "campaign";
      activeLevel = 1;
      activeTerritory = "reino";
      newGame();
      for (const n of NODES) n.taken = false;
      document.getElementById("overlay").classList.remove("show");
      document.getElementById("save-row").hidden = true;
      const sp = document.getElementById("splash"); if (sp) sp.classList.add("hide"); // testes
      updateTowerButtons(); updateHUD();
    },
    startWave: () => startWave(),
    setSpeed: (n) => { state.speed = n; },
    setEndless: (b) => { state.endless = !!b; },
    addMana: (n) => { state.mana += n; updateHUD(); },   // só p/ testes
    addLives: (n) => { state.lives += n; updateHUD(); },   // só p/ testes
    buyGlobal: (kind) => buyGlobal(kind),
    showCoach: () => showCoach(),
    dismissCoach: () => dismissCoach(),
    coachVisible: () => !document.getElementById("coach").hidden,
    resetTutorial: () => Prefs.set("seenTutorial", false),
    globalCost: (kind) => globalCost(kind),

    // constrói toro `typeId` no nó `nodeIndex`; retorna true se construiu
    build: (typeId, nodeIndex) => {
      const t = towerType(typeId), node = NODES[nodeIndex];
      if (!t || !node || node.taken) return false;
      const before = state.towers.length;
      state.selectedType = t; tryBuild(node); state.selectedType = null;
      return state.towers.length > before;
    },
    sellAt: (nodeIndex) => {
      const tw = state.towers.find(t => t.node === NODES[nodeIndex]);
      if (!tw) return false; sellTower(tw); return true;
    },
    upgradeAt: (nodeIndex) => {
      const tw = state.towers.find(t => t.node === NODES[nodeIndex]);
      if (!tw) return false;
      const lvl = tw.level; state.selectedTower = tw; upgradeTower(tw);
      return tw.level > lvl;
    },
    selectAt: (nodeIndex) => {
      const tw = state.towers.find(t => t.node === NODES[nodeIndex]);
      state.selectedTower = tw || null; state.selectedType = null;
      updateTowerButtons(); refreshShop();
      return !!tw;
    },
    // prioridade de alvo
    setTargetMode: (nodeIndex, mode) => {
      const tw = state.towers.find(t => t.node === NODES[nodeIndex]);
      if (!tw || !TARGET_MODES[mode]) return false;
      tw.targetMode = mode; tw.target = null;
      if (state.selectedTower === tw) updateTowerButtons();
      return true;
    },
    targetModeAt: (nodeIndex) => {
      const tw = state.towers.find(t => t.node === NODES[nodeIndex]);
      return tw ? tw.targetMode : null;
    },
    nextWaveCounts: () => {
      const counts = {};
      for (const id of buildWave(state.wave + 1)) counts[id] = (counts[id] || 0) + 1;
      return counts;
    },
    endGame: (won) => { if (won) winGame(); else loseGame(); }, // p/ testes da tela de fim
    isPaused: () => state.paused,
    difficulty: () => state.difficulty,
    mapId: () => currentMap,
    mapCount: () => MAPS.length,
    setMap: (id) => { Prefs.set("map", id); applyMap(id); return currentMap; },
    // campanha
    levelCount: () => territoryLevels(activeTerritory).length,
    levelId: () => state.levelId,
    startLevel: (id, tid) => startLevel(id, tid),
    startFree: () => beginFreeGame(),
    setMap: (id) => { Prefs.set("map", id); },
    mapCount: () => territoryMaps(activeTerritory).length,
    pathCount: () => PATHS.length,
    enemyPaths: () => [...new Set(state.enemies.map((e) => e.path))].sort(),
    mode: () => state.mode,
    lastStars: () => lastResult.stars,
    lastResultInfo: () => ({ stars: lastResult.stars, flawless: !!lastResult.flawless, fast: !!lastResult.fast }),
    openLevels: () => openLevels(),
    levelInfo: (id) => ({ ...Progress.get(id, activeTerritory), unlocked: Progress.unlocked(id, activeTerritory) }),
    totalStars: () => Progress.totalStars(activeTerritory),
    totalStarsAll: () => Progress.totalStarsAll(),
    activeTerritory: () => activeTerritory,
    setTerritory: (tid) => { activeTerritory = tid; },
    territoryOpen: (tid) => Progress.territoryOpen(tid),
    setScore: (n) => { state.score = n; updateHUD(); }, // p/ testar limiares de estrela
    enemyTypeCount: () => Object.keys(territoryEnemies(activeTerritory)).length,
    useAbility: (k) => activateAbility(k),
    abilityCd: (k) => +(state.abilities[k] || 0).toFixed(1),
    enemyHpTotal: () => state.enemies.filter(e => !e.dead).reduce((s, e) => s + e.hp, 0),
    fxState: () => ({ shake: +state.shake.toFixed(2), flash: +state.flash.toFixed(2) }),
    audioState: () => ({ volume: +Sound.getVolume().toFixed(2), music: Sound.isMusicOn(), sound: Sound.isEnabled() }),

    // câmera (zoom/pan) — usado nos testes
    zoomState: () => ({ zoom: +view.zoom.toFixed(3), panX: Math.round(view.panX), panY: Math.round(view.panY) }),
    setZoom: (z) => { zoomAt(z, view.cw / 2, view.ch / 2); return +view.zoom.toFixed(3); },
    resetView: () => resetView(),
    // coords de tela (clientX/Y) do nó, já passando pela câmera — p/ testes de toque
    nodeClientXY: (i) => {
      const c = camera();
      const n = NODES[i];
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width / view.cw, sy = rect.height / view.ch;
      return { x: rect.left + (n.x * c.scale + c.ox) * sx, y: rect.top + (n.y * c.scale + c.oy) * sy };
    },

    // avança a simulação `seconds` em passos fixos de `dt` (sem depender do rAF)
    step: (seconds, dt = 1 / 60) => {
      const n = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < n; i++) update(dt, true);
    },

    snapshot: () => ({
      time: +state.time.toFixed(2),
      mana: Math.floor(state.mana), lives: state.lives, wave: state.wave,
      score: state.score, running: state.running, gameOver: state.gameOver,
      won: state.won, betweenTimer: +state.betweenTimer.toFixed(2),
      enemies: state.enemies.length, queued: state.spawnQueue.length,
      projectiles: state.projectiles.length,
      slowed: state.enemies.filter(e => e.slowFactor < 1).length,
      burning: state.enemies.filter(e => e.burnUntil > state.time).length,
      flying: state.enemies.filter(e => e.def.flying).length,
      healers: state.enemies.filter(e => e.def.heal).length,
      endless: state.endless,
      globals: { ...state.globals },
      towers: state.towers.map(t => ({ type: t.type.id, level: t.level })),
    }),
  };

  // ----- aplica preferências salvas -----
  function applyPrefs() {
    const soundOn = Prefs.get("sound");
    if (!soundOn) { Sound.toggle(); /* começa desligado */ }
    document.getElementById("sound-btn").textContent = soundOn ? "🔊" : "🔇";
    const v = Prefs.get("volume");
    Sound.setVolume(typeof v === "number" ? v : 0.45);
    Sound.setMusic(!!Prefs.get("music"));
    document.getElementById("volume-slider").value = Math.round(Sound.getVolume() * 100);
    document.getElementById("music-toggle").classList.toggle("active", Sound.isMusicOn());
    state.speed = Prefs.get("speed") || 1;
    document.getElementById("speed-btn").textContent = state.speed + "×";
    document.getElementById("endless-check").checked = !!Prefs.get("endless");
  }

  // start
  applyPrefs();
  refreshShop();
  updateHUD();
  resize();
  renderLeaderboard();
  renderBest();
  requestAnimationFrame(loop);

  // mostra menu inicial
  document.getElementById("overlay-btn").textContent = "Jogar";
})();

// PWA: registra o service worker (só em http/https; ignora file://)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// Splash de abertura (visível só no mobile via CSS): some sozinho após um instante.
(function () {
  const splash = document.getElementById("splash");
  if (!splash) return;
  setTimeout(() => splash.classList.add("hide"), 850);
})();
