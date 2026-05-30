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
    hpWaveConst: 1.20,     // HPWaveConst
    speedWaveConst: 1.05,  // SpeedWaveConst
    timeBetweenWaves: 6,   // s
    spawnDelay: 0.6,       // s entre inimigos
    totalWaves: 20,
    // ----- Upgrades (skill tree do original, simplificado por torre) -----
    maxLevel: 3,           // nível 1 (base) -> 3
    upgradeCostMul: 1.6,   // custo do próx. nível = base * mul^nível
    lvlDamageMul: 1.4,     // +40% dano por nível
    lvlRangeMul: 1.12,     // +12% alcance por nível
    lvlCooldownMul: 0.88,  // -12% recarga por nível
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
    grunt: { name: "Alma", hpMul: 1.0, speedMul: 1.0, reward: 4, color: "#cdd6f4", radius: 13 },
    fast:  { name: "Espectro", hpMul: 0.6, speedMul: 1.7, reward: 5, color: "#a6e3a1", radius: 11 },
    tank:  { name: "Carrasco", hpMul: 3.2, speedMul: 0.6, reward: 9, color: "#f38ba8", radius: 19 },
    boss:  { name: "Ceifador", hpMul: 14, speedMul: 0.5, reward: 40, color: "#f9e2af", radius: 26 },
  };

  // Composição de cada onda (lista de tipos de inimigo)
  function buildWave(n) {
    const list = [];
    const count = 6 + Math.floor(n * 1.8);
    for (let i = 0; i < count; i++) {
      let t = "grunt";
      if (n >= 3 && i % 4 === 0) t = "fast";
      if (n >= 5 && i % 6 === 0) t = "tank";
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

  // ----- Stats efetivos por torre (escalam com o nível de upgrade) -----
  function effDamage(tw)   { return tw.type.damage   * Math.pow(CONFIG.lvlDamageMul,   tw.level - 1); }
  function effRange(tw)    { return tw.type.range    * Math.pow(CONFIG.lvlRangeMul,    tw.level - 1); }
  function effCooldown(tw) { return tw.type.cooldown * Math.pow(CONFIG.lvlCooldownMul, tw.level - 1); }
  function upgradeCost(tw) { return Math.round(tw.type.cost * Math.pow(CONFIG.upgradeCostMul, tw.level)); }

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
  //  ONDAS
  // ===================================================================
  function startWave() {
    if (state.running || state.gameOver) return;
    state.wave++;
    if (state.wave > CONFIG.totalWaves) { winGame(); return; }
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
      wp: 1, radius: t.radius, dead: false,
    });
  }

  // ===================================================================
  //  CONSTRUÇÃO
  // ===================================================================
  function nodeAt(p) {
    return NODES.find(n => !n.taken && dist(n, p) < 26);
  }

  function tryBuild(node) {
    const type = state.selectedType;
    if (!type) return;
    if (state.souls < type.cost) {
      spawnFloater(node.x, node.y, "Almas insuficientes!", "#ff6b81", 15);
      return;
    }
    state.souls -= type.cost;
    node.taken = true;
    state.towers.push({
      type, node, x: node.x, y: node.y, level: 1,
      cooldown: 0, angle: -Math.PI / 2, target: null,
      invested: type.cost,
    });
    spawnParticles(node.x, node.y, type.color, 12);
    Sound.play("build");
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
  function towerFire(tower, dt) {
    tower.cooldown -= dt;

    const range = effRange(tower);
    // (re)seleciona alvo: inimigo mais avançado dentro do alcance
    if (!tower.target || tower.target.dead || dist(tower, tower.target) > range) {
      tower.target = null;
      let best = -1;
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (dist(tower, e) <= range) {
          const prog = e.wp + (1 - dist(e, PATH[e.wp]) / 1000);
          if (prog > best) { best = prog; tower.target = e; }
        }
      }
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
      e.slowUntil = Math.max(e.slowUntil, performance.now() / 1000 + type.slowDur);
    }
    // Queimadura (burn DoT)
    if (type && type.burn) {
      e.burn = type.burn;
      e.burnUntil = performance.now() / 1000 + type.burnDur;
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
  function update(dt) {
    if (state.paused || state.gameOver) return;
    const now = performance.now() / 1000;

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
        if (state.wave >= CONFIG.totalWaves) winGame();
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

      const speed = e.baseSpeed * e.slowFactor;
      const tgt = PATH[e.wp];
      const d = dist(e, tgt);
      if (d <= speed * dt + 1) {
        e.x = tgt.x; e.y = tgt.y;
        e.wp++;
        if (e.wp >= PATH.length) {
          // atacou a Torre Mestra
          e.dead = true;
          state.lives--;
          spawnParticles(CORE.x, CORE.y, "#ff6b81", 18, 160);
          spawnFloater(CORE.x, CORE.y - 40, "-1 ♥", "#ff6b81", 22);
          Sound.play("leak");
          if (state.lives <= 0) { state.lives = 0; loseGame(); }
          updateHUD();
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
  function render() {
    pulse += 0.04;
    ctx.clearRect(0, 0, W, H);

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
    ctx.font = "bold 20px Segoe UI, sans-serif";
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

      // efeito gélido
      if (e.slowFactor < 1) {
        ctx.strokeStyle = "#7ad7ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2); ctx.stroke();
      }
      // efeito burn
      if (e.burnUntil > performance.now() / 1000) {
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
    const sx = W / rect.width, sy = H / rect.height;
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  }

  canvas.addEventListener("mousemove", (ev) => { mouse.world = toWorld(ev); });
  canvas.addEventListener("mouseleave", () => { mouse.world = null; });

  canvas.addEventListener("click", (ev) => {
    Sound.init(); Sound.resume();
    const w = toWorld(ev);

    // modo construção
    if (state.selectedType) {
      const node = nodeAt(w);
      if (node) { tryBuild(node); return; }
    }

    // selecionar torre existente
    const tw = state.towers.find(t => dist(t, w) < 22);
    if (tw) {
      state.selectedTower = tw;
      state.selectedType = null;
    } else {
      state.selectedTower = null;
    }
    updateTowerButtons();
    refreshShop();
  });

  // botão direito cancela seleção
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    state.selectedType = null;
    state.selectedTower = null;
    updateTowerButtons();
    refreshShop();
  });

  // Mostra/atualiza os botões de vender e melhorar a torre selecionada
  function updateTowerButtons() {
    const sb = document.getElementById("sell-btn");
    const ub = document.getElementById("upgrade-btn");
    const tw = state.selectedTower;
    if (!tw) { sb.hidden = true; ub.hidden = true; return; }
    sb.hidden = false;
    sb.textContent = `Vender (+${Math.round(tw.invested * 0.6)} ✦)`;
    ub.hidden = false;
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
    refreshShop();
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
    showOverlay("Fim de jogo", `A Torre Mestra caiu na onda ${state.wave}.`,
      `Pontuação: ${state.score}`, true);
  }
  function winGame() {
    if (state.gameOver) return;
    state.gameOver = true; state.won = true; state.running = false;
    Sound.play("win");
    showOverlay("Vitória!", `Você sobreviveu a todas as ${CONFIG.totalWaves} ondas!`,
      `Pontuação final: ${state.score}`, true);
  }

  function showOverlay(title, msg, stats, isResult) {
    const ov = document.getElementById("overlay");
    ov.querySelector("h1").textContent = title;
    document.getElementById("overlay-msg").innerHTML = msg;
    document.getElementById("overlay-stats").textContent = stats || "";
    document.getElementById("overlay-btn").textContent = isResult ? "Jogar novamente" : "Jogar";

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
    ov.classList.add("show");
    updateHUD();
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

  document.getElementById("pause-btn").addEventListener("click", () => {
    state.paused = !state.paused;
    document.getElementById("pause-btn").textContent = state.paused ? "▶" : "❚❚";
  });

  document.getElementById("speed-btn").addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
    document.getElementById("speed-btn").textContent = state.speed + "×";
  });

  document.getElementById("sound-btn").addEventListener("click", () => {
    Sound.init();
    const on = Sound.toggle();
    document.getElementById("sound-btn").textContent = on ? "🔊" : "🔇";
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

  document.getElementById("overlay-btn").addEventListener("click", () => {
    Sound.init();
    newGame();
    for (const n of NODES) n.taken = false;
    pendingScore = null;
    document.getElementById("save-row").hidden = true;
    document.getElementById("overlay").classList.remove("show");
    updateTowerButtons();
    document.getElementById("pause-btn").textContent = "❚❚";
    document.getElementById("speed-btn").textContent = "1×";
    updateHUD();
  });

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
  function resize() {
    const stage = document.getElementById("stage");
    const shopW = document.getElementById("shop").offsetWidth;
    const availW = stage.clientWidth - shopW;
    const availH = stage.clientHeight;
    const scale = Math.min(availW / W, availH / H);
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
  }
  window.addEventListener("resize", resize);

  // start
  refreshShop();
  updateHUD();
  resize();
  renderLeaderboard();
  requestAnimationFrame(loop);

  // mostra menu inicial
  document.getElementById("overlay-btn").textContent = "Jogar";
})();
