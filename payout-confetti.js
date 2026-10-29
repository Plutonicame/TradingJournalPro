// ═══════════════════════════════════════════════════════════════════════
// CONFETTIS À L'AJOUT D'UN PAYOUT — TJP · module additif, zéro-édition
// ═══════════════════════════════════════════════════════════════════════
// Quand on clique sur le bouton « + » du Pay Out (Paramètres → Capital & Risk)
// ET qu'un montant valide (> 0) est saisi :
//   • deux canons de confettis éclatent depuis le coin bas-gauche et le coin
//     bas-droit de la page ;
//   • une petite gerbe éclate autour du bouton cliqué ;
//   • un rideau de confettis tombe du haut de l'écran ;
//   • des applaudissements (synthétisés, aucun fichier audio) jouent en fond.
//
// Enveloppe addPayout() : l'original fait tout le travail, on ne fait que
// déclencher l'effet si le montant saisi était valide. Aucune donnée touchée.
// Désactivé si le système demande de réduire les animations.
// Pour supprimer : retirer la balise <script src="payout-confetti.js">.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var COLORS = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#00b0ff', '#2979ff', '#d500f9', '#ff4081', '#1de9b6', '#76ff03', '#ffd600', '#ff3d00'];
  var dpr = 1;
  var canvas = null,
    ctx = null,
    parts = [],
    raf = null,
    curtainUntil = 0,
    curtainNext = 0,
    lastT = 0;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  // ── Canvas plein écran, ignoré par la souris ──
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }

  function makePart(x, y, vx, vy) {
    return {
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      w: rnd(6, 11),
      h: rnd(4, 7),
      rot: rnd(0, 6.28),
      vr: rnd(-8, 8),
      tilt: rnd(0, 6.28),
      vt: rnd(4, 9),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      drag: rnd(0.985, 0.992),
      life: 0,
      max: rnd(3.5, 5.5)
    };
  }

  // Canon : éclate depuis un point, en éventail autour d'un angle (en degrés, 0 = droite, 90 = haut)
  function cannon(x, y, angleDeg, spread, count, power) {
    for (var i = 0; i < count; i++) {
      var a = ((angleDeg + rnd(-spread, spread)) * Math.PI) / 180;
      var s = rnd(0.45, 1) * power;
      parts.push(makePart(x, y, Math.cos(a) * s, -Math.sin(a) * s));
    }
  }

  function burstAtButton() {
    var b = document.querySelector('button[onclick="addPayout()"]');
    if (!b) return;
    var r = b.getBoundingClientRect();
    var x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    for (var i = 0; i < 300; i++) {
      var a = rnd(0, 6.28),
        s = rnd(120, 520);
      parts.push(makePart(x, y, Math.cos(a) * s, Math.sin(a) * s - 120));
    }
  }

  function curtain(now) {
    // Fait pleuvoir des confettis depuis le haut sur toute la largeur
    var n = 35 + ((Math.random() * 20) | 0);
    for (var i = 0; i < n; i++) {
      var p = makePart(rnd(0, window.innerWidth), rnd(-30, -5), rnd(-30, 30), rnd(60, 160));
      p.drag = 0.998;
      p.max = rnd(5, 8);
      parts.push(p);
    }
  }

  function frame(t) {
    var dt = Math.min(0.04, (t - lastT) / 1000 || 0.016);
    lastT = t;
    var W = window.innerWidth,
      H = window.innerHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (t < curtainUntil && t >= curtainNext) {
      curtain(t);
      curtainNext = t + 40;
    }

    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      p.vy += 520 * dt; // gravité
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      if (p.vy > 260) p.vy = 260; // vitesse limite de chute (flottement)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.tilt += p.vt * dt;
      if (p.life > p.max || p.y > H + 30) {
        parts.splice(i, 1);
        continue;
      }
      var fade = p.life > p.max - 0.8 ? Math.max(0, (p.max - p.life) / 0.8) : 1;
      // Matrice directe (plus rapide que save/restore avec des milliers de pièces)
      var c = Math.cos(p.rot) * dpr,
        s = Math.sin(p.rot) * dpr,
        k = Math.cos(p.tilt); // effet « papier qui tourne »
      ctx.setTransform(c, s, -s * k, c * k, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }

    if (parts.length || t < curtainUntil) raf = requestAnimationFrame(frame);
    else {
      raf = null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function startLoop() {
    if (raf) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // ── Applaudissements synthétisés (bruit filtré en rafales) ──
  function applause(duration) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ac = new AC();
      if (ac.state === 'suspended') ac.resume();
      var sr = ac.sampleRate;
      var buf = ac.createBuffer(1, sr, sr);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      var master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);

      // Densité de claps : monte vite, plateau, puis s'éteint
      var claps = Math.round(duration * 70);
      for (var c = 0; c < claps; c++) {
        var u = Math.random();
        // répartition dans le temps pondérée par une enveloppe
        var at = duration * (u < 0.15 ? u * 2 : u < 0.75 ? 0.3 + (u - 0.15) * 0.8 : 0.78 + (u - 0.75) * 0.88);
        var env = at < 0.4 ? at / 0.4 : at > duration - 1.2 ? Math.max(0, (duration - at) / 1.2) : 1;
        if (Math.random() > env) continue;

        var src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        var bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(1200, 3800);
        bp.Q.value = rnd(0.6, 1.6);
        var g = ac.createGain();
        var t0 = ac.currentTime + at;
        var peak = rnd(0.25, 0.9) * env;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + rnd(0.03, 0.09));
        src.connect(bp);
        bp.connect(g);
        g.connect(master);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + 0.12);
      }
      setTimeout(function () {
        try {
          ac.close();
        } catch (e) {}
      }, (duration + 1) * 1000);
    } catch (e) {
      console.warn('Applaudissements :', e);
    }
  }

  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensureCanvas();
    var W = window.innerWidth,
      H = window.innerHeight;
    var power = Math.min(1100, Math.max(700, H * 1.05));

    // Canons bas-gauche et bas-droit, vers le centre et le haut
    cannon(0, H, 62, 24, 900, power);
    cannon(W, H, 118, 24, 900, power);
    // Salves suivantes, décalées, pour un feu d'artifice continu
    setTimeout(function () {
      cannon(0, H, 55, 28, 600, power * 0.9);
      cannon(W, H, 125, 28, 600, power * 0.9);
    }, 250);
    setTimeout(function () {
      cannon(0, H, 70, 20, 500, power * 1.05);
      cannon(W, H, 110, 20, 500, power * 1.05);
    }, 600);

    burstAtButton();

    // Rideau qui tombe pendant ~2,5 s
    var now = performance.now();
    curtainUntil = now + 2800;
    curtainNext = now + 300;

    startLoop();
  }

  // ── Enveloppe de addPayout ──
  if (typeof window.addPayout === 'function') {
    var _orig = window.addPayout;
    window.addPayout = function () {
      var inp = document.getElementById('payoutInput');
      var v = inp ? parseFloat(inp.value) || 0 : 0;
      var r = _orig.apply(this, arguments);
      if (v > 0) {
        try {
          celebrate();
        } catch (e) {
          console.warn('Confettis :', e);
        }
      }
      return r;
    };
  }
})();
