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
    '.dtc-v:empty::before{content:"";}';

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

  function openPicker(inp) {
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
          openPicker(inp); // 2e clic : on propose de modifier
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
