/* =====================================================================
 * OVERHEAD — Web Edition
 * Remake web do tower defense originalmente feito em Unity.
 *
 * Mecânicas fiéis ao original:
 *   - Torre Mestra (core) central com vidas; inimigos que chegam atacam.
 *   - "Almas" (souls) como moeda: matar inimigos rende almas; torres custam almas.
 *   - Ondas com dificuldade escalante (HP e velocidade x constante por onda).
 *   - Torres (esferas) miram automaticamente e disparam projéteis teleguiados.
 *   - Efeitos especiais: slow/freeze, fatal hit (crit instantâneo),
 *     bônus de alma, dano em área e queimadura (burn DoT).
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
    initialSouls: 40,
    initialLives: 20,
    baseHP: 58,            // baseHPConst
    baseSpeed: 54,         // px/s (baseSpeedConst escalado p/ tela)
    hpWaveConst: 1.16,     // HPWaveConst — rampa de HP por onda (suavizada)
    speedWaveConst: 1.05,  // SpeedWaveConst
    timeBetweenWaves: 6,   // s
    spawnDelay: 0.6,       // s entre inimigos
    totalWaves: 20,
    // ----- Upgrades (skill tree do original, simplificado por torre) -----
    maxLevel: 4,           // nível 1 (base) -> 4; também serve de ralo de almas
    upgradeCostMul: 1.6,   // custo do próx. nível = base * mul^nível
    lvlDamageMul: 1.4,     // +40% dano por nível
    lvlRangeMul: 1.12,     // +12% alcance por nível
    lvlCooldownMul: 0.88,  // -12% recarga por nível
    // ----- Melhorias globais (ralo de almas do endgame, sem teto) -----
    globalDmgStep: 0.06,   // +6% dano por nível de Foco Arcano
    globalRngStep: 0.05,   // +5% alcance por nível de Lentes Rúnicas
  };

  // ----- Caminho que os inimigos percorrem (waypoints em world space) -----
  const PATH = [
    { x: -40,  y: 140 },
    { x: 300,  y: 140 },
    { x: 300,  y: 420 },
    { x: 620,  y: 420 },
    { x: 620,  y: 160 },
    { x: 900,  y: 160 },
    { x: 900,  y: 560 },
    { x: 640,  y: 560 }, // chega no core
  ];
  const CORE = PATH[PATH.length - 1];

  // ----- Nós de construção (perto do caminho) -----
  const NODES = [
    { x: 180, y: 280 }, { x: 430, y: 280 }, { x: 460, y: 540 },
    { x: 470, y: 300 }, { x: 760, y: 300 }, { x: 780, y: 420 },
    { x: 1040, y: 320 }, { x: 760, y: 660 }, { x: 1050, y: 600 },
    { x: 180, y: 30 }, { x: 500, y: 60 }, { x: 1050, y: 80 },
  ];

  // ----- Tipos de torre (esferas) -----
  const TOWER_TYPES = [
    {
      id: "soul", name: "Esfera de Alma", color: "#6ee7ff", cost: 14,
      damage: 18, range: 150, cooldown: 0.6, projSpeed: 520,
      desc: "Disparo rápido e equilibrado. Boa contra grupos.",
      soulBonus: 0.10, // chance de alma extra ao matar
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

  // ----- Tipos de inimigo -----
  const ENEMY_TYPES = {
    grunt: { name: "Alma", icon: "👻", hpMul: 1.0, speedMul: 1.0, reward: 4, color: "#cdd6f4", radius: 13 },
    fast:  { name: "Espectro", icon: "💨", hpMul: 0.6, speedMul: 1.7, reward: 5, color: "#a6e3a1", radius: 11 },
    tank:  { name: "Carrasco", icon: "🪨", hpMul: 3.2, speedMul: 0.6, reward: 9, color: "#f38ba8", radius: 19 },
    // Voa em linha reta até o núcleo, ignorando o caminho.
    flyer: { name: "Alma Alada", icon: "🦇", hpMul: 0.85, speedMul: 1.15, reward: 6, color: "#89dceb", radius: 12, flying: true },
    // Cura inimigos próximos periodicamente.
    healer:{ name: "Sacerdote", icon: "✚", hpMul: 1.7, speedMul: 0.8, reward: 8, color: "#94e2d5", radius: 15, heal: 22, healRange: 95, healInterval: 1.1 },
    boss:  { name: "Ceifador", icon: "💀", hpMul: 14, speedMul: 0.5, reward: 40, color: "#f9e2af", radius: 26 },
  };

  // Composição de cada onda (lista de tipos de inimigo)
  function buildWave(n) {
    const list = [];
    const count = 6 + Math.floor(n * 1.8);
    for (let i = 0; i < count; i++) {
      let t = "grunt";
      if (n >= 3 && i % 4 === 0) t = "fast";
      if (n >= 5 && i % 6 === 0) t = "tank";
      if (n >= 4 && i % 7 === 3) t = "flyer";   // voadores a partir da onda 4
      if (n >= 7 && i % 9 === 4) t = "healer";  // curandeiros a partir da onda 7
      list.push(t);
    }
    if (n % 5 === 0) list.push("boss"); // chefe a cada 5 ondas
    return list;
  }

  // ===================================================================
  //  ESTADO DO JOGO
  // ===================================================================
  let state;
  function newGame() {
    state = {
      souls: CONFIG.initialSouls,
      lives: CONFIG.initialLives,
      score: 0,
      wave: 0,
      running: false,      // true durante uma onda
      paused: false,
      gameOver: false,
      won: false,
      speed: 1,
      time: 0,             // relógio de jogo (s), avança com dt — base dos timers de efeito
      endless: false,      // modo infinito: sem vitória na onda 20
      globals: { dmg: 0, rng: 0 }, // melhorias globais compradas (ralo de almas)
      enemies: [],
      towers: [],
      projectiles: [],
      particles: [],
      floaters: [],        // textos de dano
      spawnQueue: [],
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

  function towerType(id) { return TOWER_TYPES.find(t => t.id === id); }

  // ----- Stats efetivos por torre (nível da torre + melhorias globais) -----
  function effDamage(tw)   { return tw.type.damage   * Math.pow(CONFIG.lvlDamageMul, tw.level - 1) * (1 + CONFIG.globalDmgStep * state.globals.dmg); }
  function effRange(tw)    { return tw.type.range    * Math.pow(CONFIG.lvlRangeMul,  tw.level - 1) * (1 + CONFIG.globalRngStep * state.globals.rng); }
  function effCooldown(tw) { return tw.type.cooldown * Math.pow(CONFIG.lvlCooldownMul, tw.level - 1); }
  function upgradeCost(tw) { return Math.round(tw.type.cost * Math.pow(CONFIG.upgradeCostMul, tw.level)); }

  // Melhorias globais — ralo de almas sem teto (custo escala com o nível atual)
  const GLOBALS = {
    dmg: { name: "Foco Arcano", desc: "+dano de todas as torres", base: 60, mul: 1.55, color: "#ffd166" },
    rng: { name: "Lentes Rúnicas", desc: "+alcance de todas as torres", base: 50, mul: 1.5, color: "#6ee7ff" },
  };
  function globalCost(kind) { return Math.round(GLOBALS[kind].base * Math.pow(GLOBALS[kind].mul, state.globals[kind])); }
  function buyGlobal(kind) {
    const cost = globalCost(kind);
    if (state.souls < cost) return false;
    state.souls -= cost;
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

  // ===================================================================
  //  SOM — efeitos sintetizados via Web Audio (sem arquivos externos)
  // ===================================================================
  const Sound = (() => {
    let ctx = null, master = null, enabled = true;
    function init() {
      if (ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      } catch (e) { enabled = false; }
    }
    function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }
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
      shoot_soul:  () => tone({ freq: 660, freq2: 900, type: "triangle", dur: 0.07, vol: 0.16 }),
      shoot_frost: () => tone({ freq: 520, freq2: 720, type: "sine",     dur: 0.10, vol: 0.15 }),
      shoot_doom:  () => tone({ freq: 200, freq2: 90,  type: "sawtooth", dur: 0.16, vol: 0.20 }),
      shoot_blast: () => tone({ freq: 300, freq2: 150, type: "square",   dur: 0.12, vol: 0.16 }),
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
      toggle() { enabled = !enabled; return enabled; },
      isEnabled() { return enabled; },
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
    const def = { sound: true, speed: 1, endless: false, seenTutorial: false };
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
    if (state.running || state.gameOver) return;
    state.wave++;
    if (!state.endless && state.wave > CONFIG.totalWaves) { winGame(); return; }
    state.running = true;
    state.betweenTimer = 0;
    state.spawnQueue = buildWave(state.wave);
    state.spawnTimer = 0;
    Sound.play("wave");
    updateHUD();
  }

  function waveHP() { return CONFIG.baseHP * Math.pow(CONFIG.hpWaveConst, state.wave - 1); }
  function waveSpeed() { return CONFIG.baseSpeed * Math.pow(CONFIG.speedWaveConst, state.wave - 1); }

  function spawnEnemy(typeId) {
    const t = ENEMY_TYPES[typeId];
    const maxHP = waveHP() * t.hpMul;
    state.enemies.push({
      type: typeId, def: t,
      x: PATH[0].x, y: PATH[0].y,
      hp: maxHP, maxHP,
      baseSpeed: waveSpeed() * t.speedMul,
      slowUntil: 0, slowFactor: 1,
      burn: 0, burnUntil: 0, burnTick: 0,
      healTick: t.healInterval || 0,
      wp: 1, radius: t.radius, dead: false,
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
    if (state.souls < type.cost) {
      spawnFloater(node.x, node.y, "Almas insuficientes!", "#ff6b81", 15);
      buzz([12, 40, 12]); // padrão de "negado"
      return;
    }
    state.souls -= type.cost;
    node.taken = true;
    const tower = {
      type, node, x: node.x, y: node.y, level: 1,
      cooldown: 0, angle: -Math.PI / 2, target: null,
      invested: type.cost, targetMode: "core",
    };
    state.towers.push(tower);
    spawnParticles(node.x, node.y, type.color, 12);
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
  }

  function sellTower(tower) {
    const refund = Math.round(tower.invested * 0.6);
    state.souls += refund;
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
    if (state.souls < cost) {
      spawnFloater(tower.x, tower.y, "Almas insuficientes!", "#ff6b81", 15);
      return;
    }
    state.souls -= cost;
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
  // inimigo no alcance com o MENOR peso. Usar distância ao núcleo trata os
  // voadores (que cortam direto) de forma justa, não pelo progresso no caminho.
  const TARGET_MODES = {
    core: { label: "Núcleo", weight: (tw, e) => dist(e, CORE) },          // ameaça mais iminente
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

  function towerFire(tower, dt) {
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
    if (e.hp <= 0) killEnemy(e, type);
  }

  function killEnemy(e, type) {
    if (e.dead) return;
    e.dead = true;
    let reward = e.def.reward;
    state.souls += reward;
    state.score += Math.round(reward * 2 + e.maxHP / 10);

    // Bônus de alma (soul bonus effect)
    if (type && type.soulBonus && Math.random() < type.soulBonus) {
      state.souls += reward;
      spawnFloater(e.x, e.y, "+" + reward * 2 + " ✦", "#b388ff", 16);
    } else {
      spawnFloater(e.x, e.y, "+" + reward, "#b388ff", 14);
    }
    spawnParticles(e.x, e.y, e.def.color, 14, 130);
    Sound.play(e.type === "boss" ? "boss_die" : "kill");
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

    // --- spawn da onda ---
    if (state.running) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer = CONFIG.spawnDelay;
        }
      } else if (state.enemies.length === 0) {
        // onda concluída
        state.running = false;
        state.betweenTimer = CONFIG.timeBetweenWaves;
        if (!state.endless && state.wave >= CONFIG.totalWaves) winGame();
        updateHUD();
      }
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
      // voadores vão direto ao núcleo; os demais seguem o caminho
      const tgt = e.def.flying ? CORE : PATH[e.wp];
      const d = dist(e, tgt);
      if (d <= speed * dt + 1) {
        if (e.def.flying || e.wp >= PATH.length - 1) {
          // chegou ao alvo final -> atacou a Torre Mestra
          e.dead = true;
          state.lives--;
          spawnParticles(CORE.x, CORE.y, "#ff6b81", 18, 160);
          spawnFloater(CORE.x, CORE.y - 40, "-1 ♥", "#ff6b81", 22);
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
    // limpa a tela inteira (em px de tela) e aplica a transformação da câmera
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.cw, view.ch);
    ctx.save();
    ctx.translate(ox, oy);
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
    ctx.restore();
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

  function drawPath() {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(110,231,255,0.10)";
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(110,231,255,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.lineDashOffset = -pulse * 20;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
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
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
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
    const ok = node && state.souls >= t.cost;
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
    if (t.soulBonus) tags.push("✦ bônus de almas");
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
      ub.disabled = state.souls < c;
      ub.textContent = `⬆ Melhorar p/ Nv.${tw.level + 1} (${c} ✦)`;
    }
  }

  // ===================================================================
  //  UI
  // ===================================================================
  function updateHUD() {
    document.getElementById("souls").textContent = Math.floor(state.souls);
    document.getElementById("lives").textContent = state.lives;
    document.getElementById("wave").textContent = state.wave;
    document.getElementById("score").textContent = state.score;

    const status = document.getElementById("wave-status");
    if (state.gameOver) status.textContent = state.won ? "Vitória!" : "Fim de jogo";
    else if (state.running) status.textContent = `Onda ${state.wave} em andamento — inimigos: ${state.enemies.length + state.spawnQueue.length}`;
    else if (state.betweenTimer > 0) status.textContent = `Próxima onda em ${Math.ceil(state.betweenTimer)}s…`;
    else status.textContent = state.wave === 0 ? "Prepare suas defesas…" : "Onda concluída! Inicie a próxima.";

    const startBtn = document.getElementById("start-btn");
    startBtn.disabled = state.running || state.gameOver;
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
    const lastWave = !state.endless && state.wave >= CONFIG.totalWaves;
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
      btn.disabled = state.souls < cost;
      btn.style.borderColor = g.color + "66";
    });
  }

  function refreshShop() {
    const list = document.getElementById("shop-list");
    list.innerHTML = "";
    for (const t of TOWER_TYPES) {
      const card = document.createElement("div");
      card.className = "tower-card";
      if (state.selectedType === t) card.classList.add("selected");
      if (state.souls < t.cost) card.classList.add("cant");

      const tags = [];
      if (t.slow) tags.push("❄ slow");
      if (t.fatal) tags.push("💀 fatal");
      if (t.splash) tags.push("💥 área");
      if (t.burn) tags.push("🔥 burn");
      if (t.soulBonus) tags.push("✦ bônus");

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
      });
      list.appendChild(card);
    }
  }

  // ===================================================================
  //  FIM DE JOGO
  // ===================================================================
  let pendingScore = null; // { score, wave, won } aguardando salvar no leaderboard

  function loseGame() {
    state.gameOver = true; state.won = false; state.running = false;
    Sound.play("lose");
    const n = state.towers.length;
    showOverlay("💀 Fim de jogo", `A Torre Mestra caiu na <b>onda ${state.wave}</b>.`,
      `★ ${state.score} pontos · ${n} esfera${n !== 1 ? "s" : ""} erguida${n !== 1 ? "s" : ""}`, true);
  }
  function winGame() {
    if (state.gameOver) return;
    state.gameOver = true; state.won = true; state.running = false;
    Sound.play("win");
    showOverlay("🏆 Vitória!", `Você defendeu a Torre Mestra por todas as ${CONFIG.totalWaves} ondas!`,
      `★ ${state.score} pontos · ${state.lives} vidas restantes`, true);
  }

  let lastShareText = "";

  function showOverlay(title, msg, stats, isResult) {
    const ov = document.getElementById("overlay");
    ov.querySelector("h1").textContent = title;
    document.getElementById("overlay-msg").innerHTML = msg;
    document.getElementById("overlay-stats").textContent = stats || "";
    document.getElementById("overlay-btn").textContent = isResult ? "Jogar novamente" : "Jogar";

    // estado visual: menu × resultado (vitória/derrota)
    ov.classList.toggle("result", !!isResult);
    ov.classList.toggle("win", !!isResult && state.won);
    ov.classList.toggle("lose", !!isResult && !state.won);

    // botão de compartilhar (só em resultado)
    const shareBtn = document.getElementById("share-btn");
    if (isResult) {
      const verbo = state.won ? "venci" : "sobrevivi até";
      lastShareText = `Overhead 🏰 — ${verbo} a onda ${state.wave} com ${state.score} pontos!`;
      shareBtn.hidden = false;
    } else {
      shareBtn.hidden = true;
    }

    // fila para salvar pontuação, se qualificar
    const saveRow = document.getElementById("save-row");
    if (isResult && Leaderboard.qualifies(state.score)) {
      pendingScore = { score: state.score, wave: state.wave, won: state.won };
      saveRow.hidden = false;
    } else {
      pendingScore = null;
      saveRow.hidden = true;
    }
    renderLeaderboard();
    renderBest();
    ov.classList.add("show");
    updateHUD();
  }

  function renderBest() {
    const best = Leaderboard.top()[0];
    const el = document.getElementById("best");
    el.textContent = best
      ? `Recorde: ${best.score} pts · ${best.won ? "venceu 🏆" : "onda " + best.wave} (${best.name})`
      : "";
  }

  function renderLeaderboard(highlightDate) {
    const el = document.getElementById("leaderboard");
    const list = Leaderboard.top();
    if (list.length === 0) {
      el.innerHTML = `<div class="lb-empty">Sem pontuações ainda — seja o primeiro!</div>`;
      return;
    }
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
    state.paused = !state.paused;
    document.getElementById("pause-btn").textContent = state.paused ? "▶" : "❚❚";
  });

  document.getElementById("speed-btn").addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
    document.getElementById("speed-btn").textContent = state.speed + "×";
    Prefs.set("speed", state.speed);
  });

  document.getElementById("zoom-in").addEventListener("click", () => zoomByFactor(1.3));
  document.getElementById("zoom-out").addEventListener("click", () => zoomByFactor(1 / 1.3));
  document.getElementById("zoom-reset").addEventListener("click", () => resetView());

  document.getElementById("sound-btn").addEventListener("click", () => {
    Sound.init();
    const on = Sound.toggle();
    document.getElementById("sound-btn").textContent = on ? "🔊" : "🔇";
    Prefs.set("sound", on);
  });

  // botões de melhorias globais (ralo de almas)
  document.querySelectorAll(".global-btn").forEach((btn) => {
    btn.addEventListener("click", () => { buyGlobal(btn.dataset.kind); });
  });

  // modo infinito (checkbox do menu)
  document.getElementById("endless-check").addEventListener("change", (e) => {
    Prefs.set("endless", e.target.checked);
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

  document.getElementById("share-btn").addEventListener("click", async () => {
    const text = lastShareText || "Overhead 🏰 — tower defense web!";
    const url = location.href;
    const btn = document.getElementById("share-btn");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Overhead", text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        btn.textContent = "✓ Copiado!";
        setTimeout(() => { btn.textContent = "↗ Compartilhar resultado"; }, 1800);
      }
    } catch (e) { /* usuário cancelou o compartilhamento — ignora */ }
  });

  document.getElementById("overlay-btn").addEventListener("click", () => {
    Sound.init();
    document.getElementById("overlay").classList.remove("result", "win", "lose");
    newGame();
    resetView();
    for (const n of NODES) n.taken = false;
    // aplica preferências e o modo escolhido no menu
    state.endless = document.getElementById("endless-check").checked;
    state.speed = Prefs.get("speed") || 1;
    pendingScore = null;
    document.getElementById("save-row").hidden = true;
    document.getElementById("overlay").classList.remove("show");
    updateTowerButtons();
    document.getElementById("pause-btn").textContent = "❚❚";
    document.getElementById("speed-btn").textContent = state.speed + "×";
    updateHUD();
    // mostra o coach na primeira jogada
    if (!Prefs.get("seenTutorial")) showCoach();
  });

  // ----- Coach de primeira jogada -----
  function showCoach() { document.getElementById("coach").hidden = false; }
  function dismissCoach() {
    document.getElementById("coach").hidden = true;
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
    if (e.key >= "1" && e.key <= "4") {
      const t = TOWER_TYPES[+e.key - 1];
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
    towerTypes: () => TOWER_TYPES.map(t => ({ id: t.id, name: t.name, cost: t.cost })),
    nodeCount: () => NODES.length,
    nodes: () => NODES.map((n, i) => ({ i, x: n.x, y: n.y, taken: !!n.taken })),
    freeNodes: () => NODES.map((n, i) => (n.taken ? -1 : i)).filter(i => i >= 0),

    // controle de partida
    reset: () => {
      newGame();
      for (const n of NODES) n.taken = false;
      document.getElementById("overlay").classList.remove("show");
      document.getElementById("save-row").hidden = true;
      updateTowerButtons(); updateHUD();
    },
    startWave: () => startWave(),
    setSpeed: (n) => { state.speed = n; },
    setEndless: (b) => { state.endless = !!b; },
    addSouls: (n) => { state.souls += n; updateHUD(); },   // só p/ testes
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
      souls: Math.floor(state.souls), lives: state.lives, wave: state.wave,
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
