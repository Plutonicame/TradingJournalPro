// ═══════════════════════════════════════════════════════════════════════
// DÉBUT / FIN DU TRADE — TJP · module additif
// ═══════════════════════════════════════════════════════════════════════
// Remplace l'affichage « Date » + « Heure » du formulaire de trade (nouveau
// trade ET fenêtre de modification) par deux cases : « Début » et « Fin ».
// Chaque case contient, à droite, un bouton calendrier et un bouton horloge (la valeur s'affiche à gauche) :
//   • 1er clic sur 📅 → affiche la date choisie dans l'espace restant ;
//     2e clic → ouvre le sélecteur de date pour la modifier.
//   • 1er clic sur 🕐 → affiche l'heure choisie ; 2e clic → ouvre le
//     sélecteur d'heure pour la modifier.
// Les fenêtres de choix reprennent les couleurs du calendrier de période des graphiques.
// Les vrais champs <input type="date|time"> restent dans la page (invisibles,
// mêmes id qu'avant) : toute la logique existante continue de les lire.
// La case garde exactement la taille des autres champs (un champ invisible
// de même style fixe sa hauteur).
// Couleur du bouton actif : réglable dans Thème → Général → Champs de formulaire
// (variable --fg-dtc-btn-active).
// Pour supprimer : retirer la balise <script src="trade-startend.js"> (et
// remettre l'ancien HTML Date/Heure).
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var ICON_CAL =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.6"/><path d="M2 6.5h12M5.2 1.8v2.4M10.8 1.8v2.4"/></svg>';
  var ICON_CLK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.4V8l2.4 1.6"/></svg>';

  var css =
    ':root{--fg-dtc-btn-active:#8b9bff;}' +
    '.dtc{position:relative;width:100%;}' +
    // champs réels : invisibles, mais ils fixent la taille de la case
    '.dtc .dtc-time{opacity:0;pointer-events:none;display:block;}' +
    '.dtc .dtc-date{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;pointer-events:none;}' +
    '.dtc-ui{position:absolute;inset:0;display:flex;align-items:center;gap:7px;box-sizing:border-box;padding:0 9px;' +
    'background:var(--fg-input-fg-select-fg-textarea-background,#0d1117);' +
    'border:1px solid var(--fg-input-fg-select-fg-textarea-border,#1e2a3a);border-radius:5px;' +
    'color:var(--fg-input-fg-select-fg-textarea-color,#e2e8f0);transition:border-color .15s;min-width:0;}' +
    '.dtc-ui:focus-within{border-color:var(--fg-input-focus-fg-select-focus-fg-t-bordercolo,#00e5a0);}' +
    '.dtc-b{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;' +
    'width:18px;height:18px;cursor:pointer;color:var(--muted,#64748b);border-radius:4px;transition:color .15s;}' +
    '.dtc-b:hover{color:var(--text,#e2e8f0);}' +
    '.dtc-b.on{color:var(--fg-dtc-btn-active,#8b9bff);}' +
    '.dtc-b:focus-visible{outline:1px solid var(--fg-dtc-btn-active,#8b9bff);}' +
    '.dtc-v{flex:1;min-width:0;font-size:12px;font-family:var(--mono,monospace);white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis;text-align:left;color:var(--fg-input-fg-select-fg-textarea-color,#e2e8f0);}' +
    '.dtc-v:empty::before{content:"";}' +
    // listes Heures / Minutes de la fenêtre d'heure (couleurs = calendrier de période)
    '.dtc-cols{display:flex;gap:8px;}.dtc-col{flex:1;min-width:0;}' +
    '.dtc-list{max-height:182px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;position:relative;' +
    'scrollbar-width:thin;scrollbar-color:var(--pcal-bd,#1e2d45) transparent;}' +
    '.dtc-list .pcal-day{flex:none;width:100%;}';

  function injectCss() {
    if (document.getElementById('dtc-css')) return;
    var s = document.createElement('style');
    s.id = 'dtc-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function fmtDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  // ── Fenêtres de choix (date / heure) ────────────────────────────────
  // Elles réutilisent EXACTEMENT les classes du calendrier de période des
  // graphiques (.pcal-pop, .pcal-day, .pcal-title... définies dans
  // period-calendar.js) : mêmes couleurs, mêmes bordures, mêmes cases
  // sélectionnées, et elles se règlent au même endroit (Paramètres → Thème →
  // Track Record → « Calendrier de période »). Si ce module est absent, on
  // retombe sur le sélecteur natif du navigateur.
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var pop = null, popInp = null, popAnchor = null;

  function p2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function ymd(y, m, d) {
    return y + '-' + p2(m + 1) + '-' + p2(d);
  }
  function todayStr() {
    var n = new Date();
    return ymd(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function mk(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (tag === 'button') e.type = 'button';
    return e;
  }
  function setValue(inp, v) {
    inp.value = v;
    inp.dispatchEvent(new Event('input', {bubbles: true}));
    inp.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function themed() {
    return !!document.getElementById('tjp-period-calendar-style');
  }

  function closePop() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = popInp = popAnchor = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  }
  function onOutside(e) {
    if (!pop) return;
    var t = e.target;
    if (pop.contains(t) || (popAnchor && popAnchor.contains(t))) return;
    closePop();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePop();
    }
  }
  function place() {
    if (!pop || !popAnchor) return;
    var r = popAnchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function footer(inp, hint) {
    var foot = mk('div', 'pcal-foot');
    foot.appendChild(mk('div', 'pcal-hint', hint));
    var clear = mk('button', 'pcal-clear', 'Effacer');
    clear.addEventListener('click', function () {
      setValue(inp, '');
      closePop();
    });
    foot.appendChild(clear);
    return foot;
  }

  function renderDatePop(inp, view) {
    pop.textContent = '';
    var y = view.y, m = view.m;
    var head = mk('div', 'pcal-head');
    function nav(label, delta, title) {
      var b = mk('button', 'pcal-nav', label);
      b.title = title;
      b.addEventListener('click', function () {
        var total = view.y * 12 + view.m + delta;
        view.y = Math.floor(total / 12);
        view.m = ((total % 12) + 12) % 12;
        renderDatePop(inp, view);
        place();
      });
      return b;
    }
    head.appendChild(nav('«', -12, 'Année précédente'));
    head.appendChild(nav('‹', -1, 'Mois précédent'));
    head.appendChild(mk('div', 'pcal-title', MOIS[m] + ' ' + y));
    head.appendChild(nav('›', 1, 'Mois suivant'));
    head.appendChild(nav('»', 12, 'Année suivante'));
    pop.appendChild(head);

    var grid = mk('div', 'pcal-grid');
    JOURS.forEach(function (j) {
      grid.appendChild(mk('div', 'pcal-wd', j));
    });
    var lead = (new Date(y, m, 1).getDay() + 6) % 7; // semaine qui commence le lundi
    var nd = new Date(y, m + 1, 0).getDate();
    var today = todayStr();
    var cur = inp.value;
    var i;
    for (i = 0; i < lead; i++) grid.appendChild(mk('div', 'pcal-blank'));
    for (var d = 1; d <= nd; d++) {
      var ds = ymd(y, m, d);
      var c = mk('button', 'pcal-day' + (ds === today ? ' today' : '') + (ds === cur ? ' sel' : ''), String(d));
      c.addEventListener(
        'click',
        (function (v) {
          return function () {
            setValue(inp, v);
            closePop();
          };
        })(ds)
      );
      grid.appendChild(c);
    }
    for (i = lead + nd; i < 42; i++) grid.appendChild(mk('div', 'pcal-blank'));
    pop.appendChild(grid);
    pop.appendChild(footer(inp, 'Choisis le jour'));
  }

  function renderTimePop(inp) {
    pop.textContent = '';
    var head = mk('div', 'pcal-head');
    head.appendChild(mk('div', 'pcal-title', 'Heure'));
    pop.appendChild(head);

    function cur() {
      var m = /^(\d{2}):(\d{2})/.exec(inp.value || '');
      return m ? {h: m[1], m: m[2]} : null;
    }
    var now = new Date();
    var cols = mk('div', 'dtc-cols');
    var lists = {}, counts = {};
    var STEP = 28; // hauteur d'une case (26) + espace (2)
    function column(key, label, count, nowVal) {
      var col = mk('div', 'dtc-col');
      col.appendChild(mk('div', 'pcal-wd', label));
      var list = mk('div', 'dtc-list');
      // Liste en BOUCLE : 3 copies bout à bout ; quand on sort de la copie du
      // milieu, on saute d'une copie (invisible) → 23 → 00 et 59 → 00 sans fin.
      for (var rep3 = 0; rep3 < 3; rep3++) {
        for (var v = 0; v < count; v++) {
          var t = p2(v);
          var b = mk('button', 'pcal-day' + (t === nowVal ? ' today' : ''), t);
          b.dataset.v = t;
          b.addEventListener(
            'click',
            (function (val) {
              return function () {
                var c = cur();
                if (key === 'h') {
                  setValue(inp, val + ':' + (c ? c.m : '00'));
                  mark();
                  center('h');
                } else {
                  setValue(inp, (c ? c.h : p2(now.getHours())) + ':' + val);
                  closePop();
                }
              };
            })(t)
          );
          list.appendChild(b);
        }
      }
      var copyH = count * STEP;
      list.addEventListener('scroll', function () {
        if (list.scrollTop < copyH) list.scrollTop += copyH;
        else if (list.scrollTop >= 2 * copyH) list.scrollTop -= copyH;
      });
      col.appendChild(list);
      cols.appendChild(col);
      lists[key] = list;
      counts[key] = count;
    }
    column('h', 'Heures', 24, p2(now.getHours()));
    column('m', 'Minutes', 60, p2(now.getMinutes()));
    pop.appendChild(cols);
    pop.appendChild(footer(inp, 'Choisis l’heure, puis les minutes'));

    function mark() {
      var c = cur();
      ['h', 'm'].forEach(function (k) {
        Array.prototype.forEach.call(lists[k].children, function (b) {
          b.classList.toggle('sel', !!c && b.dataset.v === c[k]);
        });
      });
    }
    mark();
    // Place la valeur choisie (ou l'heure actuelle) au milieu de la copie centrale
    function center(k) {
      var c = cur();
      var v = c ? parseInt(c[k], 10) : k === 'h' ? now.getHours() : now.getMinutes();
      var list = lists[k];
      list.scrollTop = counts[k] * STEP + v * STEP - (list.clientHeight - 26) / 2;
    }
    return function scrollToSel() {
      center('h');
      center('m');
    };
  }

  // kind : 'date' | 'time' ; anchor : la case (pour placer la fenêtre)
  function openPicker(kind, inp, anchor) {
    if (pop && popInp === inp) {
      closePop(); // 3e clic : on referme
      return;
    }
    closePop();
    if (!themed()) {
      try {
        if (inp.showPicker) {
          inp.showPicker();
          return;
        }
      } catch (e) {}
      try {
        inp.focus();
        inp.click();
      } catch (e) {}
      return;
    }
    pop = mk('div', 'pcal-pop');
    pop.style.zIndex = '20000';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', kind === 'date' ? 'Choisir la date' : "Choisir l'heure");
    popInp = inp;
    popAnchor = anchor;
    document.body.appendChild(pop);
    var after = null;
    if (kind === 'date') {
      var ref = /^\d{4}-\d{2}-\d{2}$/.test(inp.value) ? inp.value : todayStr();
      renderDatePop(inp, {y: parseInt(ref.slice(0, 4), 10), m: parseInt(ref.slice(5, 7), 10) - 1});
    } else {
      after = renderTimePop(inp);
    }
    place();
    if (after) after();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  // Construit l'interface d'une case à partir de son conteneur .dtc
  function build(box) {
    if (box._dtc) return;
    box._dtc = true;
    var dEl = box.querySelector('.dtc-date');
    var tEl = box.querySelector('.dtc-time');
    if (!dEl || !tEl) return;

    var ui = document.createElement('div');
    ui.className = 'dtc-ui';
    ui.innerHTML =
      '<span class="dtc-v"></span>' +
      '<button type="button" class="dtc-b" data-k="date" title="Date" aria-label="Date">' + ICON_CAL + '</button>' +
      '<button type="button" class="dtc-b" data-k="time" title="Heure" aria-label="Heure">' + ICON_CLK + '</button>';
    box.appendChild(ui);

    var bD = ui.querySelector('[data-k="date"]');
    var bT = ui.querySelector('[data-k="time"]');
    var out = ui.querySelector('.dtc-v');
    var shown = ''; // '' | 'date' | 'time'

    function render() {
      var ro = !!box.closest('.cp-readonly'); // fiche en lecture seule : tout est affiché
      var txt;
      if (ro) txt = [fmtDate(dEl.value), tEl.value].filter(Boolean).join(' · ');
      else if (shown === 'date') txt = fmtDate(dEl.value);
      else if (shown === 'time') txt = tEl.value;
      else txt = '';
      if (out.textContent !== txt) out.textContent = txt;
      var title = shown === 'date' ? 'Date — clique à nouveau pour modifier' : 'Date';
      bD.classList.toggle('on', shown === 'date');
      bT.classList.toggle('on', shown === 'time');
      bD.title = title;
      bT.title = shown === 'time' ? 'Heure — clique à nouveau pour modifier' : 'Heure';
    }
    box._dtcRender = render;

    function click(which, inp) {
      return function (e) {
        e.preventDefault();
        if (shown !== which) {
          shown = which; // 1er clic : on affiche la valeur
          render();
        } else {
          openPicker(which, inp, ui); // 2e clic : on propose de modifier
        }
      };
    }
    bD.addEventListener('click', click('date', dEl));
    bT.addEventListener('click', click('time', tEl));
    dEl.addEventListener('change', render);
    tEl.addEventListener('change', render);
    dEl.addEventListener('input', render);
    tEl.addEventListener('input', render);
    render();
  }

  function scan() {
    var list = document.querySelectorAll('.dtc');
    for (var i = 0; i < list.length; i++) build(list[i]);
  }

  // Les valeurs sont aussi modifiées par le code (nouveau trade, ouverture
  // d'un trade à modifier) sans événement : on resynchronise l'affichage.
  function refreshAll() {
    var list = document.querySelectorAll('.dtc');
    for (var i = 0; i < list.length; i++) {
      if (list[i]._dtcRender) list[i]._dtcRender();
    }
  }

  function init() {
    injectCss();
    scan();
    setInterval(refreshAll, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
