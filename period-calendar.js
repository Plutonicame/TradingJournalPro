// ═══════════════════════════════════════════════════════════════════════
// PÉRIODE PAR CALENDRIER — TJP · module additif, zéro-édition
// ═══════════════════════════════════════════════════════════════════════
// Ajoute sur CHAQUE graphique (natifs comme personnalisés, y compris ceux
// créés plus tard) un bouton calendrier carré, à côté des boutons de période
// (J / SEM / MOIS / TRIM / AN / TOUT), de la même hauteur qu'eux. Un clic ouvre un calendrier :
// on clique un jour de début, puis un jour de fin, et le graphique n'analyse
// plus que les trades compris entre ces deux jours (inclus).
//
//  • Trades BT : ils suivent la case « BT » du graphique, exactement comme
//    pour les autres périodes (le filtrage passe par btFilter()).
//  • Retour à une période normale : clic sur J / SEM / MOIS / TRIM / AN /
//    TOUT, ou sur « Effacer » dans le calendrier.
//  • Le bouton s'allume tant qu'une plage est active ; survole-le pour voir
//    les dates analysées.
//  • Comme les autres périodes, la plage n'est pas mémorisée au rechargement.
//
// Le même bouton est aussi posé sur la page Track Record, à côté de la case BT
// au-dessus des cartes KPI : les KPI (natifs et personnalisés) ne portent alors
// que sur les trades de la période choisie (voir applyKpiRange). « Capital » et
// « Risk actuel » sont ceux de la fin de la période ; « Pay Out » ne compte que
// les retraits datés dans la période ; « Drawdown Max » est mesuré dans la période.
// Les dates choisies restent affichées à côté du bouton tant que la période est active.
//
// Un DERNIER bouton calendrier, dans la barre de navigation (à droite des
// horloges, à côté des cases session / trades / P&L / risque — desktop ET
// mobile), donne une période GLOBALE : la choisir force TOUT le Track Record
// (chaque graphique, personnalisé ou non, et les KPI) et TOUT le Journal de
// trading (la liste des trades) à n'analyser que cette période — comme si on
// avait choisi cette même période sur chacun des calendriers un par un. Rien
// d'autre n'est concerné (Calendrier, Analyse IA, Ami, Paramètres restent
// inchangés). On garde la main ensuite : changer un graphique en particulier
// après coup ne touche que lui. « Effacer » sur ce bouton remet tout —
// graphiques, KPI et Journal — sur TOUT, y compris ce qui avait été
// personnalisé individuellement entre-temps.
//
// Fonctionnement : la plage est stockée dans ST[clé] sous la forme
// 'plage:AAAA-MM-JJ:AAAA-MM-JJ'. filterT() est enveloppée pour la comprendre ;
// le reste (libellés, BT, redessin) est déjà générique. Les boutons sont
// posés par un observateur du DOM : aucun fichier existant n'est modifié.
//
// Couleurs : tout est réglable dans Paramètres → Thème → Track Record →
// « Bouton calendrier (période des graphiques) » et « Calendrier de période
// (graphiques) » — ajouté au thème par monkey-patch de buildTV(), donc
// sauvegardé/synchronisé comme toutes les autres couleurs.
//
// N'édite aucun fichier existant : une seule ligne ajoutée dans index.html.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var PREFIX = 'plage:';
  var MOIS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  var JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  // ── 1. Couleurs du thème ────────────────────────────────────────────
  // [variable, libellé dans l'éditeur de thème, valeur de départ, section]
  var S_BTN = 'Bouton calendrier (période des graphiques)';
  var S_CAL = 'Calendrier de période (graphiques)';
  var THEME = [
    ['--pcal-btn-bg', 'Bouton calendrier - fond', '#111827', S_BTN],
    ['--pcal-btn-bd', 'Bouton calendrier - bordure', '#1e2d45', S_BTN],
    ['--pcal-btn-ic', 'Bouton calendrier - dessin', '#64748b', S_BTN],
    ['--pcal-btn-hover-bd', 'Bouton calendrier survolé - bordure', '#00e5a0', S_BTN],
    ['--pcal-btn-hover-ic', 'Bouton calendrier survolé - dessin', '#00e5a0', S_BTN],
    ['--pcal-btn-active-bg', 'Bouton calendrier actif - fond', '#00e5a0', S_BTN],
    ['--pcal-btn-active-bd', 'Bouton calendrier actif - bordure', '#00e5a0', S_BTN],
    ['--pcal-btn-active-ic', 'Bouton calendrier actif - dessin', '#0b0f1a', S_BTN],

    ['--pcal-bg', 'Calendrier - fond', '#111827', S_CAL],
    ['--pcal-bd', 'Calendrier - bordure', '#1e2d45', S_CAL],
    ['--pcal-title', 'Calendrier - mois et année', '#e2e8f0', S_CAL],
    ['--pcal-nav', 'Calendrier - flèches', '#64748b', S_CAL],
    ['--pcal-nav-hover', 'Calendrier - flèches survolées', '#00e5a0', S_CAL],
    ['--pcal-wd', 'Calendrier - jours de la semaine', '#64748b', S_CAL],
    ['--pcal-day-tx', 'Calendrier - numéros des jours', '#e2e8f0', S_CAL],
    ['--pcal-day-hover-bg', 'Calendrier - jour survolé (fond)', '#1e2d45', S_CAL],
    ['--pcal-today-bd', "Calendrier - aujourd'hui (bordure)", '#00e5a0', S_CAL],
    ['--pcal-sel-bg', 'Calendrier - premier / dernier jour (fond)', '#00e5a0', S_CAL],
    ['--pcal-sel-tx', 'Calendrier - premier / dernier jour (texte)', '#0b0f1a', S_CAL],
    ['--pcal-range-bg', 'Calendrier - jours entre les deux (fond)', '#0f3b34', S_CAL],
    ['--pcal-range-tx', 'Calendrier - jours entre les deux (texte)', '#e2e8f0', S_CAL],
    ['--pcal-hint-tx', "Calendrier - message d'aide", '#64748b', S_CAL],
    ['--pcal-clear-bg', 'Calendrier - bouton Effacer (fond)', '#111827', S_CAL],
    ['--pcal-clear-bd', 'Calendrier - bouton Effacer (bordure)', '#1e2d45', S_CAL],
    ['--pcal-clear-tx', 'Calendrier - bouton Effacer (texte)', '#e2e8f0', S_CAL]
  ];

  // ── 2. Style ────────────────────────────────────────────────────────
  var CSS =
    ':root {\n' +
    THEME.map(function (t) {
      return '  ' + t[0] + ': ' + t[2] + ';';
    }).join('\n') +
    '\n}\n' +
    `
.pcal-btn {
  flex-shrink: 0; box-sizing: border-box;
  /* Carré, de la même hauteur que les boutons de période (J / SEM / MOIS...) :
     --pcal-size est mesurée et tenue à jour par le script (voir fitAll). */
  width: var(--pcal-size, 20px); height: var(--pcal-size, 20px); padding: 0; margin: 0 0 0 4px;
  display: inline-flex; align-items: center; justify-content: center; align-self: center;
  border-radius: 3px;
  border: 1px solid var(--pcal-btn-bd);
  background: var(--pcal-btn-bg);
  color: var(--pcal-btn-ic);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.pcal-btn svg { width: 74%; height: 74%; display: block; pointer-events: none; }
.pcal-range-label { margin-left: 8px; font-family: var(--mono, monospace); font-size: 9px; color: var(--pcal-hint-tx); white-space: nowrap; }
.pcal-btn:hover { border-color: var(--pcal-btn-hover-bd); color: var(--pcal-btn-hover-ic); }
.pcal-btn.active,
.pcal-btn.active:hover {
  background: var(--pcal-btn-active-bg);
  border-color: var(--pcal-btn-active-bd);
  color: var(--pcal-btn-active-ic);
}

.pcal-pop {
  position: fixed; z-index: 4500; box-sizing: border-box;
  width: 232px; padding: 10px;
  background: var(--pcal-bg);
  border: 1px solid var(--pcal-bd);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-family: var(--mono, monospace);
  user-select: none; -webkit-user-select: none;
}
.pcal-head { display: flex; align-items: center; gap: 2px; margin-bottom: 8px; }
.pcal-title {
  flex: 1; text-align: center; font-size: 11px; font-weight: 700;
  letter-spacing: 0.5px; text-transform: capitalize; color: var(--pcal-title);
}
.pcal-nav {
  width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: var(--pcal-nav);
  font-family: inherit; font-size: 14px; line-height: 1; cursor: pointer;
}
.pcal-nav:hover { color: var(--pcal-nav-hover); }
.pcal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.pcal-wd { text-align: center; font-size: 9px; padding: 2px 0 4px; color: var(--pcal-wd); }
.pcal-blank, .pcal-day { height: 26px; }
.pcal-day {
  padding: 0; border: 1px solid transparent; border-radius: 4px;
  background: transparent; color: var(--pcal-day-tx);
  font-family: inherit; font-size: 10px; cursor: pointer;
}
.pcal-day:hover { background: var(--pcal-day-hover-bg); }
.pcal-day.today { border-color: var(--pcal-today-bd); }
.pcal-day.inrange { background: var(--pcal-range-bg); color: var(--pcal-range-tx); border-radius: 0; }
.pcal-day.sel { background: var(--pcal-sel-bg); color: var(--pcal-sel-tx); font-weight: 700; }
.pcal-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.pcal-hint { font-size: 9px; line-height: 1.35; color: var(--pcal-hint-tx); }
.pcal-clear {
  flex-shrink: 0; padding: 3px 8px; border-radius: 4px; white-space: nowrap;
  border: 1px solid var(--pcal-clear-bd);
  background: var(--pcal-clear-bg); color: var(--pcal-clear-tx);
  font-family: inherit; font-size: 9px; cursor: pointer;
}
`;
  var styleTag = document.createElement('style');
  styleTag.id = 'tjp-period-calendar-style';
  styleTag.textContent = CSS;
  document.head.appendChild(styleTag);

  // ── 3. Plage de dates : lecture / écriture / filtrage ───────────────
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function parseRange(p) {
    if (typeof p !== 'string' || p.indexOf(PREFIX) !== 0) return null;
    var parts = p.slice(PREFIX.length).split(':');
    if (parts.length !== 2 || !DATE_RE.test(parts[0]) || !DATE_RE.test(parts[1])) return null;
    return parts[0] <= parts[1] ? {from: parts[0], to: parts[1]} : {from: parts[1], to: parts[0]};
  }
  function makePeriod(a, b) {
    return PREFIX + (a <= b ? a + ':' + b : b + ':' + a);
  }
  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function ymd(y, m, d) {
    return y + '-' + pad(m + 1) + '-' + pad(d);
  }
  function fr(ds) {
    return ds.slice(8, 10) + '/' + ds.slice(5, 7) + '/' + ds.slice(0, 4);
  }
  function todayStr() {
    var n = new Date();
    return ymd(n.getFullYear(), n.getMonth(), n.getDate());
  }

  // filterT() est appelée (par filterRealT / btFilter) avec la période du
  // graphique : on ne fait qu'ajouter la lecture d'une plage, le reste est
  // inchangé. Les trades BT restent gérés par btFilter() selon la case « BT ».
  if (typeof window.filterT === 'function') {
    var _origFilterT = window.filterT;
    window.filterT = function (period) {
      var r = parseRange(period);
      if (!r) return _origFilterT.apply(this, arguments);
      return APP.trades
        .filter(function (t) {
          return t.date && t.date >= r.from && t.date <= r.to;
        })
        .sort(function (a, b) {
          return a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || '');
        });
    };
  }

  // ── 3b. KPI limités à la période (Track Record) ──
  // Les trades pris en compte sont ceux de la période (et de la case BT). Ce qui
  // est un NIVEAU (capital, risque actuel) est celui de la fin de la période ;
  // le drawdown est mesuré dans la période, à partir du capital qu'on avait au
  // début de la période.
  function cmpTrade(a, b) {
    return a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || '');
  }
  function applyKpiRange(r) {
    var bt = !!BT_STATE.kpi;
    var all = (bt ? APP.trades : realTrades())
      .filter(function (x) {
        return x.date;
      })
      .sort(cmpTrade);
    var inR = function (d) {
      return d >= r.from && d <= r.to;
    };
    var t = all.filter(function (x) {
      return inR(x.date);
    });
    var cap0 = CAPITAL();
    var fr2 = function (n) {
      return n.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    };
    var poInRange = 0,
      poUntilEnd = 0;
    lsAcc('tj_payouts', []).forEach(function (po) {
      var a = po.amount || 0;
      if (!po.date || po.date <= r.to) poUntilEnd += a;
      if (po.date && inR(po.date) && po.kind !== 'deposit') poInRange += a;
    });
    var capEnd =
      all.reduce(function (sum, x) {
        return x.date <= r.to ? sum + (x.res || 0) : sum;
      }, cap0) - poUntilEnd;
    var capStart = all.reduce(function (sum, x) {
      return x.date < r.from ? sum + (x.res || 0) : sum;
    }, cap0);
    // Risque à la fin de la période : état après le dernier trade ≤ fin de période
    var hist = computeRiskHistory(bt).hist,
      rp = hist[0].rp;
    for (var i = hist.length - 1; i >= 1; i--) {
      if (hist[i].date <= r.to) {
        rp = hist[i].rp;
        break;
      }
    }
    var re = Math.round(((capEnd * rp) / 100) * 100) / 100;
    var set = function (id, txt) {
      var el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    set('k0', fr2(capEnd) + '€');
    set('k5', (poInRange > 0 ? '-' : '') + fr2(poInRange) + ' €');
    var btCount = APP.trades.filter(function (x) {
      return x.backtest && x.date && inR(x.date);
    }).length;
    var k6 = document.getElementById('k6');
    if (k6)
      k6.innerHTML =
        t.length +
        (btCount
          ? '<br><span style="font-size:9px;opacity:.7;">' +
            (bt ? '(dont ' + btCount + ' BT)' : '(' + btCount + ' BT exclus)') +
            '</span>'
          : '');
    set('k7', re.toLocaleString('fr-FR') + '€ (' + fmtRiskPct(rp) + ')');
    if (!t.length) {
      ['k1', 'k2', 'k3', 'k4', 'k8'].forEach(function (id) {
        set(id, '');
      });
      return;
    }
    var gains = t.filter(function (x) {
        return x.res > 0;
      }),
      pertes = t.filter(function (x) {
        return x.res < 0;
      });
    var pnl = t.reduce(function (sum, x) {
      return sum + (x.res || 0);
    }, 0);
    var wr = (gains.length / t.length) * 100;
    var rrMoy =
      t.reduce(function (sum, x) {
        return sum + computeRR(x);
      }, 0) / t.length;
    var sumG = gains.reduce(function (sum, x) {
        return sum + x.res;
      }, 0),
      sumP = Math.abs(
        pertes.reduce(function (sum, x) {
          return sum + x.res;
        }, 0)
      );
    var pf = sumP > 0 ? sumG / sumP : sumG > 0 ? 99 : 0;
    var streak = 0,
      worst = 0,
      run = capStart,
      peak = capStart,
      maxDD = 0;
    t.forEach(function (x) {
      if (x.res < 0) {
        streak++;
        worst = Math.max(worst, streak);
      } else if (x.res > 0) streak = 0;
      run += x.res || 0;
      if (run > peak) peak = run;
      var dd = peak > 0 ? ((peak - run) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    });
    var pnlPct = cap0 > 0 ? (pnl / cap0) * 100 : 0;
    var rrSum = t.reduce(function (sum, x) {
      return sum + computeRR(x);
    }, 0);
    var k1el = document.getElementById('k1');
    if (k1el)
      k1el.innerHTML =
        (pnl >= 0 ? '+' : '') +
        fr2(pnl) +
        '€ (' +
        (pnlPct >= 0 ? '+' : '') +
        pnlPct.toFixed(1) +
        '%)<br><span class="kpi-sub-r">' +
        (rrSum >= 0 ? '+' : '') +
        rrSum.toFixed(2) +
        'R</span>';
    set('k2', wr.toFixed(1) + '%');
    set('k3', rrMoy.toFixed(2) + 'R');
    set('k4', pf.toFixed(2));
    set('k8', worst + ' T (' + maxDD.toFixed(1) + '%)');
  }
  if (typeof window.updateKPIs === 'function') {
    var _origUpdateKPIs = window.updateKPIs;
    window.updateKPIs = function () {
      var out = _origUpdateKPIs.apply(this, arguments);
      var r = parseRange(ST.kpi);
      if (r) applyKpiRange(r);
      return out;
    };
  }
  // Cartes KPI personnalisées : mêmes trades que les KPI natifs (donc sur la période)
  if (typeof window.cfKpiTradesFor === 'function') {
    var _origCfKpiTradesFor = window.cfKpiTradesFor;
    window.cfKpiTradesFor = function () {
      var list = _origCfKpiTradesFor.apply(this, arguments);
      var r = parseRange(ST.kpi);
      return r
        ? list.filter(function (x) {
            return x.date && x.date >= r.from && x.date <= r.to;
          })
        : list;
    };
  }

  // ── 4. Boutons calendrier sur chaque graphique ──────────────────────
  var ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3"/></svg>';

  function chartKeyOf(group) {
    var b = group.querySelector('.pbtn[data-chart]');
    return b ? b.dataset.chart : null;
  }

  // Aligne l'apparence du bouton (et des boutons de période) sur ST[clé].
  function syncGroup(group) {
    var key = chartKeyOf(group);
    var btn = group.querySelector('.pcal-btn');
    if (!key || !btn) return;
    var r = parseRange(ST[key]);
    btn.classList.toggle('active', !!r);
    btn.title = r
      ? 'Période analysée : du ' + fr(r.from) + ' au ' + fr(r.to) + ' (clic pour modifier)'
      : 'Choisir une période dans le calendrier';
    if (r) {
      group.querySelectorAll('.pbtn').forEach(function (b) {
        b.classList.remove('active');
      });
    }
  }
  // Bouton du bandeau KPI (Track Record) : même principe, sans groupe de boutons de période.
  function syncKpiBtn() {
    var btn = document.querySelector('.pcal-btn[data-chart="kpi"]');
    if (!btn) return;
    var r = parseRange(ST.kpi);
    btn.classList.toggle('active', !!r);
    btn.title = r
      ? 'Période analysée par les KPI : du ' + fr(r.from) + ' au ' + fr(r.to) + ' (clic pour modifier)'
      : 'Choisir la période analysée par les KPI';
    var lbl = btn.parentNode.querySelector('.pcal-range-label');
    if (lbl) lbl.textContent = r ? 'du ' + fr(r.from) + ' au ' + fr(r.to) : '';
  }
  // Bouton global (barre de navigation) : deux exemplaires dans le DOM (desktop
  // et mobile, un seul visible à la fois selon la largeur d'écran) — on met les
  // deux à jour pour qu'ils restent cohérents si la fenêtre est redimensionnée.
  function syncGlobalBtn() {
    var r = parseRange(ST.global);
    document.querySelectorAll('.pcal-btn[data-chart="global"]').forEach(function (btn) {
      btn.classList.toggle('active', !!r);
      btn.title = r
        ? 'Période active pour tout le Track Record et le Journal de trading : du ' + fr(r.from) + ' au ' + fr(r.to) + ' (clic pour modifier)'
        : 'Choisir une période pour tout le Track Record et le Journal de trading';
      var lbl = btn.parentNode.querySelector('.pcal-range-label');
      if (lbl) lbl.textContent = r ? 'du ' + fr(r.from) + ' au ' + fr(r.to) : '';
    });
  }
  function syncAll() {
    document.querySelectorAll('.period-btns').forEach(syncGroup);
    syncKpiBtn();
    syncGlobalBtn();
  }

  // Le bouton calendrier est un carré dont le côté = la hauteur des boutons de
  // période. On mesure cette hauteur NATURELLE (le bouton est ramené à 0 le
  // temps de la mesure : sinon, plus haut qu'eux, il étirerait toute la ligne
  // et on mesurerait sa propre taille) puis on la lui donne, et on la suit avec
  // un ResizeObserver (chargement de la police, mode d'affichage, réglages du
  // thème...) au lieu de la figer en pixels.
  var fitQueued = false;
  function fitAll() {
    fitQueued = false;
    var groups = Array.prototype.filter.call(document.querySelectorAll('.period-btns'), function (g) {
      return g.querySelector('.pcal-btn') && g.querySelector('.pbtn');
    });
    groups.forEach(function (g) {
      g.querySelector('.pcal-btn').style.setProperty('--pcal-size', '0px');
    });
    var heights = groups.map(function (g) {
      return g.querySelector('.pbtn').getBoundingClientRect().height;
    });
    groups.forEach(function (g, i) {
      var btn = g.querySelector('.pcal-btn');
      if (heights[i] > 0) btn.style.setProperty('--pcal-size', Math.round(heights[i] * 100) / 100 + 'px');
      else btn.style.removeProperty('--pcal-size'); // graphique masqué : valeur par défaut, recalculée à son affichage
    });
    // Bouton du bandeau KPI : même taille que ceux des graphiques.
    var ref = 0;
    heights.forEach(function (h) {
      if (!ref && h > 0) ref = h;
    });
    document.querySelectorAll('.pcal-btn[data-chart="kpi"]').forEach(function (b) {
      b.style.setProperty('--pcal-size', Math.round((ref || 17) * 100) / 100 + 'px');
    });
    // Bouton global (barre de navigation) : à la hauteur des badges de SA barre
    // (desktop ou mobile — pas celle des graphiques, sans rapport visuel ici).
    [
      ['navRisk', 'global-desktop'],
      ['navRisk2', 'global-mobile']
    ].forEach(function (pair) {
      var badge = document.getElementById(pair[0]);
      var h2 = badge ? badge.getBoundingClientRect().height : 0;
      document.querySelectorAll('.pcal-btn[data-nav="' + pair[1] + '"]').forEach(function (b) {
        b.style.setProperty('--pcal-size', Math.round((h2 || 17) * 100) / 100 + 'px');
      });
    });
  }
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(fitAll);
  }
  var sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(queueFit) : null;

  function decorate() {
    var added = false;
    document.querySelectorAll('.period-btns').forEach(function (group) {
      var key = chartKeyOf(group);
      if (!key) return;
      if (!group.querySelector('.pcal-btn')) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pcal-btn';
        btn.dataset.chart = key;
        btn.setAttribute('aria-label', 'Choisir une période dans un calendrier');
        btn.innerHTML = ICON;
        group.appendChild(btn);
        var ref = group.querySelector('.pbtn');
        if (sizeObserver && ref) sizeObserver.observe(ref);
        added = true;
        // Graphique tout juste apparu (ex. graphique personnalisé créé après coup) :
        // s'il y a déjà une période globale active, il en hérite tout de suite au
        // lieu de démarrer sur TOUT, comme les autres graphiques déjà présents.
        var g = parseRange(ST.global);
        if (g) {
          ST[key] = ST.global;
          redraw(key);
        }
      }
      syncGroup(group);
    });
    // Track Record : bouton à côté de la case BT, au-dessus des cartes KPI
    var btKpi = document.getElementById('bt-kpi');
    var kpiBox = btKpi && btKpi.closest('div');
    if (kpiBox && !kpiBox.querySelector('.pcal-btn')) {
      var kb = document.createElement('button');
      kb.type = 'button';
      kb.className = 'pcal-btn';
      kb.dataset.chart = 'kpi';
      kb.setAttribute('aria-label', 'Choisir la période analysée par les KPI');
      kb.innerHTML = ICON;
      kpiBox.appendChild(kb);
      var kl = document.createElement('span');
      kl.className = 'pcal-range-label';
      kpiBox.appendChild(kl);
      added = true;
    }
    syncKpiBtn();
    // Barre de navigation : bouton global. Desktop et mobile partagent la
    // même clé de fonctionnement mais le mobile a 2 emplacements possibles
    // (25/09/2026, demande de Paul) : PC vertical et téléphone utilisent la
    // même barre .nav-mobile, mais pas le même endroit dedans. On recalcule
    // l'emplacement à CHAQUE passage (y compris au redimensionnement, voir
    // l'écoute 'resize' plus bas) : bouton+étiquette sont retrouvés via
    // data-nav/data-for et simplement déplacés si besoin, jamais recréés.
    //  - Desktop/PC ultra wide (barre .nav-desktop, donc menu burger PAS
    //    forcé dans Paramètres) : tout à gauche des 4 cases (Session,
    //    Trades, P&L, Risk) — étiquette de période à gauche du bouton.
    //  - Menu burger forcé (Paramètres) alors que le mode détecté/choisi
    //    est PC normal ou ultra wide (25/09/2026, demande de Paul) : la
    //    barre .nav-mobile est affichée sur une seule ligne façon desktop
    //    (voir cf-nav-force-column dans custom-fields.js) — même
    //    emplacement que la vraie barre desktop, mais autour de
    //    sessionBadge2 cette fois.
    //  - PC vertical : ligne du HAUT (celle des horloges), tout à droite.
    //  - Téléphone (ou menu burger forcé en mode réellement détecté
    //    téléphone) : ligne du bas, à gauche du groupe Trades/P&L/Risk
    //    (le badge Session étant seul sur sa ligne).
    // Dans tous les cas, c'est le mode LOGIQUE (cfScreenMode(), forçable
    // dans Paramètres) qui décide — jamais la barre visible seule : le menu
    // burger peut être affiché sur un PC normal/ultra wide sans que ça
    // change où va le bouton.
    function pcalGlobalParts(navKey) {
      var gb = document.querySelector('.pcal-btn[data-nav="' + navKey + '"]');
      var gl = gb && gb.parentNode ? gb.parentNode.querySelector('.pcal-range-label[data-for="' + navKey + '"]') : null;
      if (!gb) {
        gb = document.createElement('button');
        gb.type = 'button';
        gb.className = 'pcal-btn';
        gb.dataset.chart = 'global';
        gb.dataset.nav = navKey;
        gb.setAttribute(
          'aria-label',
          'Choisir une période pour tout le Track Record et le Journal de trading'
        );
        gb.innerHTML = ICON;
      }
      if (!gl) {
        gl = document.createElement('span');
        gl.className = 'pcal-range-label';
        gl.dataset.for = navKey;
      }
      return [gb, gl];
    }
    // Déplacement SEULEMENT si le bouton/l'étiquette ne sont pas déjà au bon
    // endroit : les retirer puis les remettre à chaque passage (decorate()
    // tourne à chaque mutation de #page-trackrecord et à chaque redimensionnement)
    // pouvait faire perdre un clic tombé entre l'appui et le relâchement de la
    // souris, alors que le bouton n'avait pourtant pas bougé.
    function pcalIsBefore(anchor, nodes) {
      var cur = anchor.previousElementSibling;
      for (var i = nodes.length - 1; i >= 0; i--) {
        if (cur !== nodes[i]) return false;
        cur = cur.previousElementSibling;
      }
      return true;
    }
    function pcalPlaceBefore(anchor, nodes) {
      if (pcalIsBefore(anchor, nodes)) return false;
      nodes.forEach(function (n) {
        anchor.parentNode.insertBefore(n, anchor);
      });
      return true;
    }
    function pcalPlaceAtEnd(parent, nodes) {
      var cur = parent.lastElementChild,
        ok = true;
      for (var i = nodes.length - 1; i >= 0; i--) {
        if (cur !== nodes[i]) {
          ok = false;
          break;
        }
        cur = cur.previousElementSibling;
      }
      if (ok) return false;
      nodes.forEach(function (n) {
        parent.appendChild(n);
      });
      return true;
    }
    (function () {
      var anchor = document.getElementById('sessionBadge');
      if (!anchor) return;
      var parts = pcalGlobalParts('global-desktop');
      // étiquette d'abord, puis le bouton, juste avant la case Session
      if (pcalPlaceBefore(anchor, [parts[1], parts[0]])) added = true;
    })();
    (function () {
      var parts = pcalGlobalParts('global-mobile');
      var mode = typeof cfScreenMode === 'function' ? cfScreenMode() : 'phone';
      if (mode === 'vertical') {
        var clocks = document.querySelector('.nav-mobile-clocks');
        if (!clocks) return;
        if (pcalPlaceAtEnd(clocks.parentNode, [parts[0], parts[1]])) added = true;
      } else if (mode === 'normal' || mode === 'ultrawide') {
        var anchor2 = document.getElementById('sessionBadge2');
        if (!anchor2) return;
        if (pcalPlaceBefore(anchor2, [parts[1], parts[0]])) added = true;
      } else {
        var anchor3 = document.getElementById('navTrades2');
        if (!anchor3) return;
        if (pcalPlaceBefore(anchor3, [parts[0], parts[1]])) added = true;
      }
    })();
    // Mesure de la taille du bouton : à re-faire quand un badge de référence
    // change de taille (mode d'affichage, thème...), pas seulement au déplacement.
    if (sizeObserver) {
      ['navRisk', 'navRisk2'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) sizeObserver.observe(b);
      });
    }
    syncGlobalBtn();
    if (added) queueFit();
  }

  // Les graphiques sont créés à différents moments (démarrage, graphiques
  // personnalisés ajoutés ou réordonnés, changement de compte...) : on
  // surveille le DOM plutôt que de dépendre d'un appel précis.
  var decoTimer = null;
  function scheduleDecorate() {
    if (decoTimer) return;
    decoTimer = setTimeout(function () {
      decoTimer = null;
      decorate();
    }, 60);
  }
  // Observé sur #page-trackrecord SEULEMENT (pas toute la page) : c'est la seule
  // zone où un nouveau graphique personnalisé peut apparaître dynamiquement
  // (cfFullRerender()). Observer TOUTE la page (document.documentElement)
  // réagissait aussi aux mutations internes d'autres bibliothèques ailleurs
  // (ex. les éléments temporaires de Sortable.js pendant un glisser-déposer
  // dans Paramètres), et le travail fait ici à chaque déclenchement (requêtes
  // DOM + mesures de tailles, forçant des recalculs de mise en page) pouvait
  // perturber leur propre suivi tactile en plein geste.
  var pcalObserveRoot = document.getElementById('page-trackrecord') || document.documentElement;
  new MutationObserver(scheduleDecorate).observe(pcalObserveRoot, {
    childList: true,
    subtree: true
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
  // PC vertical et téléphone partagent la même barre .nav-mobile mais pas le
  // même emplacement pour le bouton global (25/09/2026) : un redimensionnement
  // de fenêtre peut faire changer cfScreenMode() sans qu'aucun élément ne soit
  // ajouté/retiré du DOM (donc sans déclencher le MutationObserver ci-dessus),
  // d'où cette écoute dédiée.
  window.addEventListener('resize', function () {
    scheduleDecorate();
    queueFit();
  });

  // Un clic sur J / SEM / MOIS / TRIM / AN / TOUT remplace la période (les
  // gestionnaires d'origine écrivent ST[clé]) : on remet le bouton calendrier
  // à jour juste après eux.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.pbtn[data-chart]')) setTimeout(syncAll, 0);
  });

  // ── 5. Le calendrier ────────────────────────────────────────────────
  var pop = null; // élément du calendrier ouvert
  var popKey = null; // clé du graphique concerné
  var popBtn = null; // bouton calendrier qui l'a ouvert
  var view = null; // {y, m} mois affiché
  var startDay = null; // premier jour choisi, en attente du second

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function closePop() {
    if (pop) pop.remove();
    pop = popKey = popBtn = startDay = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onReflow);
    window.removeEventListener('scroll', onReflow, true);
  }
  function onOutside(e) {
    if (!pop) return;
    if (pop.contains(e.target) || (popBtn && popBtn.contains(e.target))) return;
    closePop();
  }
  function onKey(e) {
    if (e.key === 'Escape') closePop();
  }
  // Défilement de la page / redimensionnement : le calendrier suit son bouton,
  // et se ferme si le bouton a disparu ou est sorti de l'écran.
  function onReflow(e) {
    if (!pop) return;
    if (e && e.target && e.target.nodeType === 1 && pop.contains(e.target)) return;
    if (!popBtn || !document.body.contains(popBtn)) {
      closePop();
      return;
    }
    var r = popBtn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > document.documentElement.clientHeight) {
      closePop();
      return;
    }
    place();
  }

  function place() {
    if (!pop || !popBtn) return;
    var r = popBtn.getBoundingClientRect();
    var w = pop.offsetWidth,
      h = pop.offsetHeight;
    var vw = document.documentElement.clientWidth,
      vh = document.documentElement.clientHeight;
    var left = Math.min(Math.max(8, r.right - w), Math.max(8, vw - w - 8));
    var top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  // Surligne le début / la fin / les jours entre les deux. Pendant le choix du
  // second jour, `hover` fait apparaître un aperçu de la plage.
  function paint(hover) {
    if (!pop) return;
    var a = null,
      b = null;
    if (startDay) {
      a = startDay;
      b = hover || startDay;
    } else {
      var r = parseRange(ST[popKey]);
      if (r) {
        a = r.from;
        b = r.to;
      }
    }
    if (a && b && a > b) {
      var t = a;
      a = b;
      b = t;
    }
    pop.querySelectorAll('.pcal-day').forEach(function (c) {
      var d = c.dataset.d;
      c.classList.toggle('sel', !!a && (d === a || d === b));
      c.classList.toggle('inrange', !!a && d > a && d < b);
    });
  }

  function hintText() {
    if (startDay) return 'Choisis maintenant le jour de fin';
    var r = parseRange(ST[popKey]);
    return r
      ? 'Du ' + fr(r.from) + ' au ' + fr(r.to) + ' — choisis un nouveau jour de début'
      : 'Choisis le jour de début';
  }

  function navBtn(label, delta, title) {
    var b = el('button', 'pcal-nav', label);
    b.type = 'button';
    b.title = title;
    b.dataset.nav = String(delta);
    return b;
  }

  function render() {
    pop.textContent = '';
    var y = view.y,
      m = view.m;

    var head = el('div', 'pcal-head');
    head.appendChild(navBtn('«', -12, 'Année précédente'));
    head.appendChild(navBtn('‹', -1, 'Mois précédent'));
    head.appendChild(el('div', 'pcal-title', MOIS[m] + ' ' + y));
    head.appendChild(navBtn('›', 1, 'Mois suivant'));
    head.appendChild(navBtn('»', 12, 'Année suivante'));
    pop.appendChild(head);

    var grid = el('div', 'pcal-grid');
    JOURS.forEach(function (j) {
      grid.appendChild(el('div', 'pcal-wd', j));
    });
    var lead = (new Date(y, m, 1).getDay() + 6) % 7; // semaine qui commence le lundi
    var nd = new Date(y, m + 1, 0).getDate();
    var today = todayStr();
    for (var i = 0; i < lead; i++) grid.appendChild(el('div', 'pcal-blank'));
    for (var d = 1; d <= nd; d++) {
      var ds = ymd(y, m, d);
      var c = el('button', 'pcal-day' + (ds === today ? ' today' : ''), String(d));
      c.type = 'button';
      c.dataset.d = ds;
      grid.appendChild(c);
    }
    // Toujours 6 lignes : le calendrier garde la même hauteur d'un mois à l'autre.
    for (var k = lead + nd; k < 42; k++) grid.appendChild(el('div', 'pcal-blank'));
    pop.appendChild(grid);

    var foot = el('div', 'pcal-foot');
    foot.appendChild(el('div', 'pcal-hint', hintText()));
    var clear = el('button', 'pcal-clear', 'Effacer');
    clear.type = 'button';
    clear.title = 'Revenir à la période TOUT';
    foot.appendChild(clear);
    pop.appendChild(foot);

    paint();
  }

  function openPop(btn) {
    var key = btn.dataset.chart;
    // Un calendrier resté référencé alors qu'il n'est plus dans la page (retiré
    // par autre chose que closePop) ne doit pas faire croire qu'il est ouvert :
    // sinon le clic suivant ne ferait que le "refermer" et rien ne s'afficherait
    // (25/09/2026, bug signalé : impossible de rouvrir le calendrier de la barre
    // de navigation après avoir choisi une période).
    if (pop && !document.body.contains(pop)) closePop();
    if (pop && popKey === key && popBtn === btn) {
      closePop(); // 2e clic sur le même bouton : on referme
      return;
    }
    closePop();
    popKey = key;
    popBtn = btn;
    startDay = null;
    var r = parseRange(ST[key]);
    var ref = r ? r.from : todayStr();
    view = {y: parseInt(ref.slice(0, 4), 10), m: parseInt(ref.slice(5, 7), 10) - 1};
    pop = el('div', 'pcal-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choisir la période à analyser');
    document.body.appendChild(pop);
    render();
    place();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
  }

  function redraw(key) {
    if (typeof redrawForKey === 'function') redrawForKey(key);
  }

  // Applique une période à TOUS les graphiques (natifs et personnalisés), aux
  // KPI et au Journal de trading (clé 'hist' : pas de bouton visible pour lui,
  // il suit simplement le mouvement) — exactement comme si on avait choisi
  // cette période sur chacun de leurs calendriers un par un. On peut toujours
  // changer un graphique en particulier ensuite, indépendamment.
  function propagateGlobal(period) {
    var keys = {hist: true}; // Journal de trading, sans bouton à lui
    document.querySelectorAll('.pcal-btn[data-chart]').forEach(function (b) {
      var k = b.dataset.chart;
      if (k && k !== 'global') keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      ST[k] = period;
      redraw(k);
    });
    syncAll();
  }

  function applyRange(key, a, b) {
    closePop();
    ST[key] = makePeriod(a, b);
    syncAll();
    try {
      redraw(key);
      if (key === 'global') propagateGlobal(ST.global);
    } catch (e) {
      console.warn('PCAL applyRange:', e);
    }
    syncAll();
  }

  function clearRange(key) {
    var btn = document.querySelector('.pcal-btn[data-chart="' + key + '"]');
    var group = btn && btn.closest('.period-btns');
    closePop();
    ST[key] = 'tout';
    if (group) {
      group.querySelectorAll('.pbtn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.p === 'tout');
      });
    }
    syncAll();
    redraw(key);
    if (key === 'global') propagateGlobal('tout');
  }

  // Journal de trading (Historique) : pas de bouton calendrier à lui, mais il
  // suit ST.hist — donc la période globale — en filtrant temporairement
  // APP.trades le temps du rendu (renderTable() lit APP.trades directement et
  // n'expose pas de point d'accroche plus fin ; la liste complète est remise en
  // place aussitôt après, avant qu'aucun autre code ne s'exécute).
  if (typeof window.renderTable === 'function') {
    var _origRenderTable = window.renderTable;
    window.renderTable = function () {
      var r = parseRange(ST.hist);
      if (!r) return _origRenderTable.apply(this, arguments);
      var saved = APP.trades;
      APP.trades = APP.trades.filter(function (t) {
        return t.date && t.date >= r.from && t.date <= r.to;
      });
      try {
        return _origRenderTable.apply(this, arguments);
      } finally {
        APP.trades = saved;
      }
    };
  }

  // Clics dans le calendrier et sur les boutons calendrier (délégation : les
  // boutons naissent et disparaissent avec les graphiques).
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var calBtn = t.closest('.pcal-btn');
    if (calBtn) {
      e.preventDefault();
      openPop(calBtn);
      return;
    }
    if (!pop || !pop.contains(t)) return;

    var nav = t.closest('.pcal-nav');
    if (nav) {
      var total = view.y * 12 + view.m + parseInt(nav.dataset.nav, 10);
      view = {y: Math.floor(total / 12), m: ((total % 12) + 12) % 12};
      render();
      return;
    }
    if (t.closest('.pcal-clear')) {
      clearRange(popKey);
      return;
    }
    var day = t.closest('.pcal-day');
    if (day) {
      if (!startDay) {
        startDay = day.dataset.d;
        pop.querySelector('.pcal-hint').textContent = hintText();
        paint();
      } else {
        applyRange(popKey, startDay, day.dataset.d);
      }
    }
  });
  document.addEventListener('mouseover', function (e) {
    if (!pop || !startDay || !e.target.closest) return;
    var day = e.target.closest('.pcal-day');
    if (day && pop.contains(day)) paint(day.dataset.d);
  });

  // ── 6. Intégration au thème ─────────────────────────────────────────
  // Ajoute les couleurs à la liste que l'éditeur de thème affiche (Paramètres
  // → Thème → Track Record), sans toucher à app-part1.js.
  if (typeof window.buildTV === 'function') {
    var _origBuildTV = window.buildTV;
    window.buildTV = function () {
      var tv = _origBuildTV.apply(this, arguments);
      THEME.forEach(function (t) {
        tv.push({v: t[0], l: t[1], page: 'Track Record', section: t[3]});
      });
      return tv;
    };
  }
})();
