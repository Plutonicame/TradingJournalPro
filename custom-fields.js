// ══════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS — Champs personnalisés (TJP)
// ──────────────────────────────────────────────────────────────────────────
// Module 100% additif : ne modifie AUCUNE fonction existante par édition
// directe. Il surcharge (wrap) certaines fonctions globales et construit le
// reste au runtime (DOM). Pour désactiver entièrement cette fonctionnalité,
// il suffit de retirer la balise <script src="custom-fields.js"> — aucun
// autre fichier n'est touché.
//
// Permet à l'utilisateur, depuis Paramètres :
//  - de créer des questions custom (format : étoiles / texte / nombre /
//    menu déroulant / case à cocher / date), placées où il veut dans le
//    questionnaire "Nouveau Trade" (et dans "Modifier le trade") — sauf les
//    cases à cocher (Oui/Non), qui vont toujours tout en bas à côté de
//    "Backtest" plutôt que dans le questionnaire (seul leur ordre entre
//    elles est configurable, voir cfInjectToggleFields) ;
//  - chaque question crée une colonne dans l'historique des trades, dont on
//    choisit le nom et la position (parmi les colonnes existantes + les
//    nouvelles) ;
//  - chaque question peut en plus créer un widget dans le Track Record :
//    case KPI, widget carré/rond/rectangle, courbe, barres verticales,
//    barres horizontales ou camembert — et être réordonnée avec les KPI /
//    graphiques déjà existants ;
//  - chaque nouveau widget ajoute automatiquement ses réglages de couleur
//    dans l'éditeur de thème.
// ══════════════════════════════════════════════════════════════════════════

// ── Référentiels des éléments natifs (pour les ancrages de position) ──
const CF_BUILTIN_COLS = [
  {id: 'date', label: 'Date'},
  {id: 'heure', label: 'Heure'},
  {id: 'session', label: 'Session'},
  {id: 'paire', label: 'Paire'},
  {id: 'dir', label: 'Dir.'},
  {id: 'tf', label: 'TF'},
  {id: 'conf', label: 'Confluences'},
  {id: 'rrcible', label: 'RR Cible'},
  {id: 'rrpris', label: 'RR Réalisé'},
  {id: 'res', label: 'Résultat'},
  {id: 'pct', label: '%'},
  {id: 'mgmt', label: 'Mgmt'},
  {id: 'reprend', label: 'Reprend.'},
  {id: 'stars', label: 'Note'},
  {id: 'img', label: '📷'}
];
const CF_BUILTIN_FORM_ANCHORS = [
  {id: 'date', label: 'Date'},
  {id: 'heure', label: 'Heure'},
  {id: 'session', label: 'Session'},
  {id: 'paire', label: 'Paire / Actif'},
  {id: 'dir', label: 'Direction'},
  {id: 'rrcible', label: 'RR Cible'},
  {id: 'res', label: 'Résultat'},
  {id: 'mgmt', label: 'Management'},
  {id: 'reprend', label: 'Reprendrais-tu ?'},
  {id: 'tf', label: 'Timeframes'},
  {id: 'conf', label: 'Confluences'},
  {id: 'notes', label: 'Notes'},
  {id: 'stars', label: 'Note ⭐'},
  {id: 'images', label: 'Images du trade'}
];
const CF_BUILTIN_KPIS = [
  {id: 'kpi1', label: 'Capital'},
  {id: 'kpi2', label: 'P&L Total'},
  {id: 'kpi3', label: 'Win Rate'},
  {id: 'kpi4', label: 'RR Moyen'},
  {id: 'kpi5', label: 'Profit Factor'},
  {id: 'kpi6', label: 'Pay Out'},
  {id: 'kpi7', label: 'Trades'},
  {id: 'kpi8', label: 'Risk Actuel'},
  {id: 'kpi9', label: 'Drawdown Max'}
];
const CF_BUILTIN_CHARTS = [
  {id: 'eq', label: 'Évolution du capital'},
  {id: 'pnl', label: 'P&L'},
  {id: 'risk', label: 'Risk Management'},
  {id: 'pie', label: 'Win Rate'},
  {id: 'mgmt', label: 'Impact du management'},
  {id: 'conf', label: 'Par confluence'},
  {id: 'pairs', label: 'Par paire / actif'},
  {id: 'sessions', label: 'Par session'},
  {id: 'jours', label: 'Par jour de semaine'},
  {id: 'tf', label: 'Par timeframe'}
];
const CF_TYPE_META = {
  stars: {
    label: 'Note en étoiles (1 à 5)',
    widgets: ['none', 'kpi', 'card', 'bar-v', 'bar-h', 'pie']
  },
  text: {label: 'Zone de texte', widgets: ['none']},
  number: {label: 'Nombre', widgets: ['none', 'kpi', 'card', 'line']},
  select: {label: 'Menu déroulant', widgets: ['none', 'kpi', 'card', 'bar-v', 'bar-h', 'pie']},
  toggle: {
    label: 'Case à cocher (Oui/Non)',
    widgets: ['none', 'kpi', 'card', 'bar-v', 'bar-h', 'pie']
  },
  date: {label: 'Date', widgets: ['none', 'kpi', 'card']}
};
const CF_WIDGET_META = {
  none: {label: 'Aucun'},
  kpi: {label: 'Case KPI (bande fine, en haut)'},
  card: {label: 'Widget (rectangle)'},
  line: {label: 'Courbe'},
  'bar-v': {label: 'Barres verticales'},
  'bar-h': {label: 'Barres horizontales'},
  pie: {label: 'Camembert'}
};
const CF_CHART_WIDGET_KINDS = ['card', 'line', 'bar-v', 'bar-h', 'pie'];
// Les 4 profils d'écran (voir cfScreenMode() plus bas pour le détail de la
// détection). Liste centrale réutilisée partout où les 4 modes doivent être
// énumérés (ordres par mode, réglages de navigation par mode, sélecteur de
// mode forcé...).
const CF_SCREEN_MODES = ['phone', 'vertical', 'normal', 'ultrawide'];
const CF_MODE_LABELS = {
  phone: 'Téléphone',
  vertical: 'PC vertical',
  normal: 'PC normal',
  ultrawide: 'Ultra wide'
};
// Paramètres fixes forcés sur TOUS les camemberts (natif Win Rate +
// custom), pour qu'ils soient tous rigoureusement identiques (rayon ET
// zone) :
//  - CF_PIE_RADIUS : rayon de l'anneau, en pixels absolus.
//  - CF_PIE_CANVAS_MAX : taille max du canevas (carré), en pixels. Pas de
//    légende à loger (plugins.legend.display:false partout, catégories
//    identifiées par l'info-bulle au clic/survol) : juste assez de marge
//    autour de l'anneau (200px de diamètre) pour l'effet de survol
//    (hoverOffset) et le padding interne de Chart.js.
//  - CF_PIE_ZONE_HEIGHT : hauteur de la zone (fond) qui contient le canevas.
// cfEnsureChartsContainer() applique ces 3 valeurs au Win Rate natif (qui
// avait ses propres dimensions, différentes, dans index.html) pour qu'il
// utilise exactement les mêmes paramètres que les camemberts custom.
const CF_PIE_RADIUS = 100;
const CF_PIE_CANVAS_MAX = 220;
const CF_PIE_ZONE_HEIGHT = 240;

// ── Chargement / sauvegarde ──
// Rétrocompatibilité : avant les 4 modes, "chartOrder" était un tableau
// unique partagé par tous les écrans. On le retrouve comme point de départ
// identique des 4 modes au premier chargement après la mise à jour, pour ne
// pas perdre l'ordre déjà choisi.
function cfNormalizeChartOrderByMode(cfg) {
  const out = {};
  if (cfg && cfg.chartOrderByMode && typeof cfg.chartOrderByMode === 'object') {
    CF_SCREEN_MODES.forEach(m => {
      out[m] = Array.isArray(cfg.chartOrderByMode[m]) ? cfg.chartOrderByMode[m] : null;
    });
    return out;
  }
  if (cfg && Array.isArray(cfg.chartOrder)) {
    CF_SCREEN_MODES.forEach(m => (out[m] = cfg.chartOrder.slice()));
    return out;
  }
  return out;
}
function cfLoad() {
  const cfg = lsAcc('tj_cf_config', null);
  APP.cfFields = cfg && Array.isArray(cfg.fields) ? cfg.fields : [];
  APP.cfColOrder = cfg && Array.isArray(cfg.colOrder) ? cfg.colOrder : null;
  APP.cfKpiOrder = cfg && Array.isArray(cfg.kpiOrder) ? cfg.kpiOrder : null;
  // Ordre des questions du formulaire et des cases à cocher : sauvegardé avec le
  // reste de la config (jusqu'ici il n'était ni gardé au rechargement, ni
  // envoyé au cloud — donc jamais synchronisé entre appareils).
  APP.cfQuestionOrder = cfg && Array.isArray(cfg.questionOrder) ? cfg.questionOrder : null;
  APP.cfToggleOrder = cfg && Array.isArray(cfg.toggleOrder) ? cfg.toggleOrder : null;
  APP.cfChartOrderByMode = cfNormalizeChartOrderByMode(cfg);
  APP.cfNavColumnByMode =
    cfg && cfg.navColumnByMode && typeof cfg.navColumnByMode === 'object'
      ? cfg.navColumnByMode
      : {};
  APP.cfChartLinksByMode =
    cfg && cfg.chartLinksByMode && typeof cfg.chartLinksByMode === 'object'
      ? cfg.chartLinksByMode
      : {};
  APP.cfPencilStyles =
    cfg && cfg.pencilStyles && typeof cfg.pencilStyles === 'object' ? cfg.pencilStyles : {};
}
function cfConfigSnapshot() {
  return {
    fields: APP.cfFields,
    colOrder: APP.cfColOrder,
    kpiOrder: APP.cfKpiOrder,
    questionOrder: APP.cfQuestionOrder,
    toggleOrder: APP.cfToggleOrder,
    chartOrderByMode: APP.cfChartOrderByMode,
    navColumnByMode: APP.cfNavColumnByMode,
    chartLinksByMode: APP.cfChartLinksByMode,
    pencilStyles: APP.cfPencilStyles
  };
}
function cfPersist() {
  lssAcc('tj_cf_config', cfConfigSnapshot());
  if (typeof currentUser !== 'undefined' && currentUser && !_isSyncing) {
    schedulePush(300);
  }
}
function cfNewId() {
  return 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function cfInsertIntoOrder(orderArr, id, afterId) {
  const idx = orderArr.indexOf(id);
  if (idx !== -1) orderArr.splice(idx, 1);
  if (afterId === '__start__') {
    orderArr.unshift(id);
    return;
  } // choix explicite "— Au début —"
  if (afterId) {
    const pos = orderArr.indexOf(afterId);
    if (pos !== -1) {
      orderArr.splice(pos + 1, 0, id);
      return;
    }
  }
  orderArr.push(id); // par défaut ("— À la fin —") ou ancre introuvable : on ajoute à la fin
}
// Un "saut de ligne" est un repère de mise en page ajouté dans
// APP.cfQuestionOrder, jamais une vraie question : rien n'est sauvegardé
// dans les trades, rien n'apparaît comme champ à remplir. Là où il se
// trouve, les questions suivantes démarrent une nouvelle ligne dans le
// formulaire (18/09/2026, demande de Paul).
function cfIsLineBreak(id) {
  return typeof id === 'string' && id.indexOf('__break_') === 0;
}
function cfAddLineBreak() {
  cfEnsureOrders();
  const id = '__break_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  APP.cfQuestionOrder.unshift(id);
  cfPersist();
  cfInjectFormFields('f');
  cfInjectFormFields('e');
  cfRenderSettings();
}
function cfRemoveLineBreak(id) {
  APP.cfQuestionOrder = (APP.cfQuestionOrder || []).filter(x => x !== id);
  cfPersist();
  cfInjectFormFields('f');
  cfInjectFormFields('e');
  cfRenderSettings();
}
function cfEnsureOrders() {
  if (!APP.cfColOrder) APP.cfColOrder = CF_BUILTIN_COLS.map(c => c.id);
  if (!APP.cfKpiOrder) APP.cfKpiOrder = CF_BUILTIN_KPIS.map(k => k.id);
  // Ordre des QUESTIONS du formulaire "nouveau trade" (18/09/2026, demande
  // de Paul) : questions natives et personnalisées librement mélangeables
  // entre elles, comme colonnes/KPI/graphiques ci-dessus — remplace
  // l'ancien système d'ancrage (afterField) pour tout sauf les cases à
  // cocher, qui restent une liste à part (APP.cfToggleOrder plus bas,
  // même principe de glisser-déposer). Peut aussi contenir des "sauts de
  // ligne" (ids préfixés __break_, voir cfIsLineBreak) : de simples
  // repères de mise en page, jamais de vraies questions.
  if (!APP.cfQuestionOrder) APP.cfQuestionOrder = CF_BUILTIN_FORM_ANCHORS.map(a => a.id);
  // Ordre des CASES À COCHER entre elles (18/09/2026, demande de Paul) :
  // "backtest" (native) est un membre de cet ordre comme les autres,
  // jamais un point de départ fixe — remplace l'ancien menu déroulant par
  // case (cfInjectToggleFields, ci-dessous).
  if (!APP.cfToggleOrder) {
    APP.cfToggleOrder = ['backtest'].concat(
      APP.cfFields.filter(f => f.type === 'toggle').map(f => f.id)
    );
  }
  if (!APP.cfChartOrderByMode) APP.cfChartOrderByMode = {};
  if (!APP.cfNavColumnByMode) APP.cfNavColumnByMode = {};
  if (!APP.cfChartLinksByMode) APP.cfChartLinksByMode = {};
  CF_SCREEN_MODES.forEach(m => {
    if (!APP.cfChartOrderByMode[m]) APP.cfChartOrderByMode[m] = CF_BUILTIN_CHARTS.map(c => c.id);
    if (!Array.isArray(APP.cfChartLinksByMode[m])) APP.cfChartLinksByMode[m] = [];
  });
  const kpiFieldIds = new Set(
    APP.cfFields.filter(f => f.widget && f.widget.kind === 'kpi').map(f => f.id)
  );
  const chartFieldIds = new Set(
    APP.cfFields
      .filter(f => f.widget && CF_CHART_WIDGET_KINDS.includes(f.widget.kind))
      .map(f => f.id)
  );
  const allFieldIds = new Set(APP.cfFields.map(f => f.id));
  const questionFieldIds = new Set(APP.cfFields.filter(f => f.type !== 'toggle').map(f => f.id));
  const toggleFieldIds = new Set(APP.cfFields.filter(f => f.type === 'toggle').map(f => f.id));
  APP.cfFields.forEach(f => {
    if (!APP.cfColOrder.includes(f.id)) APP.cfColOrder.push(f.id);
  });
  questionFieldIds.forEach(id => {
    if (!APP.cfQuestionOrder.includes(id)) APP.cfQuestionOrder.push(id);
  });
  // Une ancre native ajoutée après coup (ex: "images", le 18/09/2026,
  // demande de Paul) doit aussi rejoindre un ordre déjà existant et
  // personnalisé — sinon elle ne serait jamais insérée nulle part. Ajoutée
  // à la fin par défaut : après la dernière question, puisque les cases à
  // cocher vivent dans une liste séparée (APP.cfToggleOrder) et
  // apparaissent de toute façon toujours après le questionnaire.
  CF_BUILTIN_FORM_ANCHORS.forEach(a => {
    if (!APP.cfQuestionOrder.includes(a.id)) APP.cfQuestionOrder.push(a.id);
  });
  toggleFieldIds.forEach(id => {
    if (!APP.cfToggleOrder.includes(id)) APP.cfToggleOrder.push(id);
  });
  kpiFieldIds.forEach(id => {
    if (!APP.cfKpiOrder.includes(id)) APP.cfKpiOrder.push(id);
  });
  chartFieldIds.forEach(id => {
    CF_SCREEN_MODES.forEach(m => {
      if (!APP.cfChartOrderByMode[m].includes(id)) APP.cfChartOrderByMode[m].push(id);
    });
  });
  const builtinColIds = new Set(CF_BUILTIN_COLS.map(c => c.id));
  const builtinFormIds = new Set(CF_BUILTIN_FORM_ANCHORS.map(a => a.id));
  const builtinKpiIds = new Set(CF_BUILTIN_KPIS.map(k => k.id));
  const builtinChartIds = new Set(CF_BUILTIN_CHARTS.map(c => c.id));
  APP.cfColOrder = APP.cfColOrder.filter(id => builtinColIds.has(id) || allFieldIds.has(id));
  APP.cfQuestionOrder = APP.cfQuestionOrder.filter(
    id => builtinFormIds.has(id) || questionFieldIds.has(id) || cfIsLineBreak(id)
  );
  APP.cfToggleOrder = APP.cfToggleOrder.filter(id => id === 'backtest' || toggleFieldIds.has(id));
  APP.cfKpiOrder = APP.cfKpiOrder.filter(id => builtinKpiIds.has(id) || kpiFieldIds.has(id));
  CF_SCREEN_MODES.forEach(m => {
    APP.cfChartOrderByMode[m] = APP.cfChartOrderByMode[m].filter(
      id => builtinChartIds.has(id) || chartFieldIds.has(id)
    );
    // Une liaison n'a de sens que si ses 2 graphiques existent encore ET
    // sont toujours immédiatement adjacents (dans ce sens précis) dans
    // l'ordre de CE mode — sinon on la laisse tomber silencieusement.
    const order = APP.cfChartOrderByMode[m];
    APP.cfChartLinksByMode[m] = APP.cfChartLinksByMode[m].filter(key => {
      const parts = key.split('|');
      if (parts.length !== 2) return false;
      const idx = order.indexOf(parts[0]);
      return idx !== -1 && order[idx + 1] === parts[1];
    });
  });
}
// Initialisation IMMÉDIATE et synchrone (pas de setTimeout / DOMContentLoaded
// ici) : APP existe déjà (const APP=loadState(); s'est exécuté avant que ce
// script ne charge), mais le propre code d'init de l'app appelle renderTable()
// / refreshAllCharts() de façon synchrone dès son propre DOMContentLoaded,
// AVANT que notre init différée (cfInit, plus bas) n'ait eu la moindre chance
// de s'exécuter. Sans cet appel immédiat, APP.cfFields resterait `undefined`
// pendant la toute première passe de rendu native → erreur au chargement.
cfLoad();
cfEnsureOrders();

// ── Stats sur les trades pour un champ custom ──
function cfDisplayValue(field, t) {
  const v = t['cf_' + field.id];
  if (field.type === 'toggle') return v ? 'Oui' : v === false ? 'Non' : undefined;
  return v;
}
function cfNumericStats(field, trades) {
  const list = trades || realTrades();
  const vals = list
    .map(t => t['cf_' + field.id])
    .filter(v => v !== undefined && v !== null && v !== '' && !isNaN(parseFloat(v)))
    .map(v => parseFloat(v));
  const sum = vals.reduce((a, b) => a + b, 0);
  return {vals, count: vals.length, avg: vals.length ? sum / vals.length : 0, sum};
}
function cfCategoryStats(field, trades) {
  const list = trades || realTrades();
  const map = {};
  list.forEach(t => {
    const raw = cfDisplayValue(field, t);
    if (raw === undefined || raw === null || raw === '') return;
    const v = String(raw);
    if (!map[v]) map[v] = {pnl: 0, wins: 0, total: 0};
    map[v].pnl += t.res || 0;
    if (t.res > 0) map[v].wins++;
    map[v].total++;
  });
  return map;
}
// Trades regroupés par réponse, avec EXACTEMENT le même regroupement que
// cfCategoryStats() : sert à afficher, au clic sur une barre / une tranche, la
// liste des trades analysés dans cette zone (comme les graphiques natifs).
function cfTradesByCategory(field, trades) {
  const map = {};
  (trades || []).forEach(t => {
    const raw = cfDisplayValue(field, t);
    if (raw === undefined || raw === null || raw === '') return;
    const v = String(raw);
    if (!map[v]) map[v] = [];
    map[v].push(t);
  });
  return map;
}
// Curseur « main » au survol d'une zone cliquable, comme sur les graphiques natifs.
function cfChartHover(evt, elements) {
  if (evt && evt.native && evt.native.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
}
// Nombre de tranches à prévoir pour un camembert (thème + dessin), selon le
// nombre RÉEL de réponses possibles pour ce champ (pas une valeur figée) :
// menu déroulant -> nombre d'options configurées ; étoiles -> 5 ; case à
// cocher -> 2 (Oui/Non).
function cfPieSliceCount(field) {
  if (field.type === 'select') return Math.max(1, (field.options || []).length);
  if (field.type === 'stars') return 5;
  if (field.type === 'toggle') return 2;
  return 6;
}
// Ordre stable des catégories d'un CAMEMBERT uniquement (pas les barres, qui
// restent triées par performance) : pour un menu déroulant, on respecte
// l'ordre des options telles que configurées (1ère option = 1ère tranche,
// etc.) — modifiable directement dans "Listes personnalisables"
// (glisser-déposer) — plutôt que l'ordre d'apparition dans les données, pour
// que les couleurs choisies dans le thème restent toujours associées à la
// même réponse.
function cfCategoryOrder(field, map) {
  if (field.type === 'select' && field.options && field.options.length) {
    const ordered = field.options.filter(o => map[o]);
    Object.keys(map).forEach(k => {
      if (!ordered.includes(k)) ordered.push(k);
    });
    return ordered;
  }
  return Object.keys(map);
}
// Toutes les cases KPI (bandeau du haut ET cartes de la section Graphiques)
// suivent l'UNIQUE bouton BT déjà présent en haut du bandeau KPI (bt-kpi /
// BT_STATE.kpi) — pas de bouton BT individuel ajouté sur les nouvelles cases.
function cfKpiTradesFor(field) {
  return typeof BT_STATE !== 'undefined' && BT_STATE.kpi ? APP.trades : realTrades();
}
function cfKpiValueText(field) {
  const trades = cfKpiTradesFor(field);
  if (field.type === 'stars' || field.type === 'number') {
    const {avg, count} = cfNumericStats(field, trades);
    if (!count) return '—';
    return avg.toFixed(field.type === 'stars' ? 1 : 2) + (field.type === 'stars' ? ' ★' : '');
  }
  if (field.type === 'text') {
    const c = trades.filter(t => t['cf_' + field.id]).length;
    return c + ' réponse' + (c > 1 ? 's' : '');
  }
  if (field.type === 'toggle') {
    const map = cfCategoryStats(field, trades);
    const oui = map['Oui'] || {wins: 0, total: 0};
    const non = map['Non'] || {wins: 0, total: 0};
    if (!oui.total && !non.total) return '—';
    const wr = oui.total ? Math.round((oui.wins / oui.total) * 100) + '%' : '—';
    return `${oui.total} oui · ${non.total} non · ${wr}`;
  }
  const map = cfCategoryStats(field, trades);
  const ks = Object.keys(map);
  if (!ks.length) return '—';
  ks.sort((a, b) => map[b].total - map[a].total);
  return ks[0] + ' (' + map[ks[0]].total + ')';
}

// ── Rendu des champs dans les formulaires (Nouveau Trade / Modifier) ──
function cfInputId(prefix, field) {
  return prefix + '-cf-' + field.id;
}
function cfFieldInputHtml(prefix, field) {
  const id = cfInputId(prefix, field);
  const labelText = escapeHtml(field.label);
  const labelHtml = `<label data-editable data-cf-custom-label="1" id="${cfLabelId(prefix, field)}" data-cf-field-id="${field.id}">${labelText}</label>`;
  if (field.type === 'text') {
    return `<div class="fg spanall cf-field" id="${id}-wrap">${labelHtml}<textarea id="${id}" class="cf-input" oninput="autoGrow(this)"></textarea></div>`;
  }
  if (field.type === 'number') {
    return `<div class="fg cf-field" id="${id}-wrap">${labelHtml}<input type="number" step="any" id="${id}" class="cf-input"></div>`;
  }
  if (field.type === 'date') {
    return `<div class="fg cf-field" id="${id}-wrap">${labelHtml}<input type="date" id="${id}" class="cf-input"></div>`;
  }
  if (field.type === 'select') {
    const opts = (field.options || []).map(o => `<option>${escapeHtml(o)}</option>`).join('');
    return `<div class="fg cf-field" id="${id}-wrap">${labelHtml}<select id="${id}" class="cf-input"><option value="">—</option>${opts}</select></div>`;
  }
  if (field.type === 'toggle') {
    // Les cases à cocher n'apparaissent JAMAIS dans le questionnaire
    // principal — voir cfInjectToggleFields() : elles sont injectées à part,
    // tout en bas à côté de "Backtest", avec un rendu assorti à celui-ci
    // plutôt que le bloc .fg générique des autres formats de réponse.
    return `<label class="cf-toggle-field" id="${id}-wrap" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--muted);"><input type="checkbox" id="${id}" class="cf-input" style="width:16px;height:16px;cursor:pointer;accent-color:var(--bt-bg);"><span data-editable data-cf-custom-label="1" id="${cfLabelId(prefix, field)}" data-cf-field-id="${field.id}">${labelText}</span></label>`;
  }
  if (field.type === 'stars') {
    return `<div class="fg spanall cf-field" id="${id}-wrap">${labelHtml}
      <div class="star-picker" id="${id}-picker" data-val="0">
        <span class="star-pick" data-v="1">★</span><span class="star-pick" data-v="2">★</span><span class="star-pick" data-v="3">★</span><span class="star-pick" data-v="4">★</span><span class="star-pick" data-v="5">★</span>
      </div><input type="hidden" id="${id}" class="cf-input" value="0"></div>`;
  }
  return '';
}
function cfLabelId(prefix, field) {
  return 'cflabel' + prefix + '-' + field.id;
}
function cfReadInput(prefix, field) {
  const el = document.getElementById(cfInputId(prefix, field));
  if (!el) return undefined;
  if (field.type === 'toggle') return !!el.checked;
  if (field.type === 'number') return el.value === '' ? '' : parseFloat(el.value);
  return el.value;
}
function cfSetInputValue(prefix, field, val) {
  const id = cfInputId(prefix, field);
  const el = document.getElementById(id);
  if (!el) return;
  if (field.type === 'toggle') {
    el.checked = !!val;
    return;
  }
  if (field.type === 'stars') {
    if (typeof initStarPicker === 'function') initStarPicker(id + '-picker', id, val || 0);
    return;
  }
  el.value = val === undefined || val === null ? '' : val;
}
function cfBuiltinAnchorEl(prefix, anchorId) {
  const specialWrap = {
    tf: prefix === 'f' ? 'tf-wrap' : 'e-tf-wrap',
    conf: prefix === 'f' ? 'conf-wrap' : 'e-conf-wrap'
  };
  if (specialWrap[anchorId]) {
    const w = document.getElementById(specialWrap[anchorId]);
    return w ? w.closest('.fg') : null;
  }
  if (anchorId === 'stars') {
    const w = document.getElementById(prefix + '-stars-picker');
    return w ? w.closest('.fg') : null;
  }
  if (anchorId === 'images') {
    return document.getElementById(prefix + '-images-block');
  }
  const inp = document.getElementById(prefix + '-' + anchorId);
  return inp ? inp.closest('.fg') : null;
}
function cfInjectFormFields(prefix) {
  const grid =
    prefix === 'f'
      ? document.querySelector('#page-journal .form-grid')
      : document.querySelector('#editModal .form-grid');
  if (!grid) return;
  cfEnsureOrders();
  // Repositionne TOUT (questions natives + personnalisées + sauts de
  // ligne) dans l'ordre de APP.cfQuestionOrder, librement mélangeable par
  // glisser-déposer dans les Paramètres (18/09/2026, demande de Paul —
  // remplace l'ancien système d'ancrage afterField pour tout sauf les
  // cases à cocher, gérées à part par cfInjectToggleFields via
  // APP.cfToggleOrder). Les questions natives sont déjà dans le DOM
  // (cfBuiltinAnchorEl les retrouve par leur ancre) : on les déplace
  // simplement ; les
  // personnalisées et les sauts de ligne sont (re)créés à chaque passage.
  grid.querySelectorAll('.cf-field, .cf-line-break').forEach(el => el.remove());
  APP.cfQuestionOrder.forEach(id => {
    if (cfIsLineBreak(id)) {
      const el = document.createElement('div');
      el.className = 'fg spanall cf-line-break';
      el.style.cssText = 'height:0;min-height:0;padding:0;margin:0;border:0;';
      grid.appendChild(el);
      return;
    }
    const f = APP.cfFields.find(x => x.id === id);
    if (f) {
      const tmp = document.createElement('div');
      tmp.innerHTML = cfFieldInputHtml(prefix, f);
      const el = tmp.firstElementChild;
      if (!el) return;
      grid.appendChild(el);
      if (f.type === 'stars') {
        const inputId = cfInputId(prefix, f);
        if (typeof initStarPicker === 'function') initStarPicker(inputId + '-picker', inputId, 0);
      }
      return;
    }
    const anchorEl = cfBuiltinAnchorEl(prefix, id);
    if (anchorEl) grid.appendChild(anchorEl);
  });
  cfInjectToggleFields(prefix);
}
// Cases à cocher (Oui/Non) du questionnaire : toujours à part, jamais dans
// la grille du questionnaire — mais depuis le 18/09/2026 (demande de Paul)
// leur ordre ENTRE ELLES se glisse-dépose comme tout le reste (voir
// APP.cfToggleOrder / "ORDRE DES CASES À COCHER"), au lieu de l'ancien menu
// déroulant par case. "backtest" (native) est un membre de cet ordre comme
// les autres, jamais un point de départ fixe.
function cfInjectToggleFields(prefix) {
  const container = document.getElementById(prefix + '-toggles-row');
  const btLabel = document.getElementById(prefix + '-backtest');
  const backtestEl = btLabel ? btLabel.closest('label') : null;
  if (!container || !backtestEl) return;
  cfEnsureOrders();
  container.querySelectorAll('.cf-toggle-field').forEach(el => el.remove());
  APP.cfToggleOrder.forEach(id => {
    if (id === 'backtest') {
      container.appendChild(backtestEl);
      return;
    }
    const f = APP.cfFields.find(x => x.id === id && x.type === 'toggle');
    if (!f) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = cfFieldInputHtml(prefix, f);
    const el = tmp.firstElementChild;
    if (el) container.appendChild(el);
  });
}

// ── Colonnes de l'historique des trades ──
function cfFormatValue(field, val) {
  if (val === undefined || val === null || val === '') {
    return '<span style="color:var(--muted)">—</span>';
  }
  if (field.type === 'stars') {
    const n = parseFloat(val) || 0;
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return `<span style="color:#f5b93d;letter-spacing:1px;">${s}</span>`;
  }
  if (field.type === 'toggle') return escapeHtml(val === true || val === 'true' ? 'Oui' : 'Non');
  return escapeHtml(String(val));
}
function cfApplyColumnOrder() {
  cfEnsureOrders();
  const theadRow = document.querySelector('#page-journal thead tr');
  if (theadRow && !theadRow.dataset.cfTagged) {
    Array.from(theadRow.children).forEach((th, i) => {
      if (CF_BUILTIN_COLS[i]) th.dataset.cid = CF_BUILTIN_COLS[i].id;
    });
    theadRow.dataset.cfTagged = '1';
  }
  if (theadRow) {
    const ths = {};
    Array.from(theadRow.children).forEach(th => {
      if (th.dataset.cid) ths[th.dataset.cid] = th;
    });
    const actionsTh = theadRow.lastElementChild;
    APP.cfFields.forEach(f => {
      let th = document.getElementById('cfth-' + f.id);
      if (!th) {
        th = document.createElement('th');
        th.id = 'cfth-' + f.id;
        theadRow.insertBefore(th, actionsTh);
      }
      th.textContent = f.colName || f.label;
      ths[f.id] = th;
    });
    APP.cfColOrder.forEach(id => {
      if (ths[id]) theadRow.insertBefore(ths[id], actionsTh);
    });
    // th orphelins (champ supprimé) : nettoyage
    theadRow.querySelectorAll('th[id^="cfth-"]').forEach(th => {
      const fid = th.id.replace('cfth-', '');
      if (!APP.cfFields.some(f => f.id === fid)) th.remove();
    });
  }
  document.querySelectorAll('#tradeTable tr').forEach(tr => {
    const editBtn = tr.querySelector('.del-btn[onclick^="openEditTrade"]');
    const m = editBtn && editBtn.getAttribute('onclick').match(/openEditTrade\((\d+)\)/);
    const tid = m ? parseInt(m[1], 10) : null;
    const t = tid != null ? APP.trades.find(x => x.id === tid) : null;
    const tds = {};
    Array.from(tr.children).forEach((td, i) => {
      if (CF_BUILTIN_COLS[i]) tds[CF_BUILTIN_COLS[i].id] = td;
    });
    const actionsTd = tr.lastElementChild;
    APP.cfFields.forEach(f => {
      const td = document.createElement('td');
      td.innerHTML = cfFormatValue(f, t ? t['cf_' + f.id] : null);
      tds[f.id] = td;
      tr.insertBefore(td, actionsTd);
    });
    APP.cfColOrder.forEach(id => {
      if (tds[id]) tr.insertBefore(tds[id], actionsTd);
    });
  });
  // Les colonnes personnalisées sont ajoutées APRÈS le rendu natif du
  // tableau (voir le wrapper de renderTable plus bas), qui a donc déjà
  // appelé syncTableScrollbar() avec une largeur de tableau pas encore à
  // jour (sans ces colonnes) — on la rappelle ici pour que la barre de
  // défilement du haut reflète toujours la largeur RÉELLE finale, et
  // reste déplaçable jusqu'à tout à droite (16/09/2026).
  if (typeof syncTableScrollbar === 'function') syncTableScrollbar();
}

// ── Cases KPI (bande fine) ──
function cfTagBuiltinKpiCards() {
  const strip = document.querySelector('#page-trackrecord .kpi-strip');
  if (!strip || strip.dataset.cfTagged) return;
  for (let i = 1; i <= 9; i++) {
    const valEl = document.getElementById('k' + (i - 1));
    const card = valEl ? valEl.closest('.kpi-card') : null;
    if (card) card.dataset.kpiId = 'kpi' + i;
  }
  strip.dataset.cfTagged = '1';
}
function cfEnsureKpiNode(field) {
  let el = document.getElementById('kpicf-' + field.id);
  const strip = document.querySelector('#page-trackrecord .kpi-strip');
  if (!strip) return null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'kpi-card';
    el.id = 'kpicf-' + field.id;
    el.dataset.kpiId = field.id;
    el.innerHTML = `<div class="kpi-bar" id="kpicfbar-${field.id}"></div><div class="kpi-icon" data-editable id="cfkpiicon-${field.id}">🔹</div><div class="kpi-label" data-editable data-tvar="--kpi-label-color" id="cfkpilabel-${field.id}" style="color:var(--kpi-label-color,#64748b)">${escapeHtml(field.colName || field.label)}</div><div class="kpi-value" id="kpicfval-${field.id}">—</div>`;
    strip.appendChild(el);
  }
  return el;
}
function cfRenderKpiWidgets() {
  const strip = document.querySelector('#page-trackrecord .kpi-strip');
  if (!strip) return;
  const kpiFields = APP.cfFields.filter(f => f.widget && f.widget.kind === 'kpi');
  kpiFields.forEach(f => {
    cfEnsureKpiNode(f);
    const valEl = document.getElementById('kpicfval-' + f.id);
    const barEl = document.getElementById('kpicfbar-' + f.id);
    const c = gc('--cf-' + f.id + '-color') || '#00e5a0';
    if (valEl) {
      valEl.textContent = cfKpiValueText(f);
      valEl.style.color = c;
    }
    if (barEl) barEl.style.background = c;
  });
  strip.querySelectorAll('[id^="kpicf-"]').forEach(el => {
    const id = el.id.replace('kpicf-', '');
    if (!kpiFields.some(f => f.id === id)) el.remove();
  });
  if (typeof applyPencilEdits === 'function') applyPencilEdits();
}
function cfApplyKpiOrder() {
  const strip = document.querySelector('#page-trackrecord .kpi-strip');
  if (!strip) return;
  cfTagBuiltinKpiCards();
  cfEnsureOrders();
  const map = {};
  Array.from(strip.querySelectorAll('.kpi-card')).forEach(card => {
    if (card.dataset.kpiId) map[card.dataset.kpiId] = card;
  });
  APP.cfKpiOrder.forEach(id => {
    if (map[id]) strip.appendChild(map[id]);
  });
}
// Nombre maximum de cases KPI par ligne, selon le mode d'affichage (voir
// cfScreenMode() plus bas — téléphone / PC vertical / PC normal / ultra wide).
const CF_KPI_MAX_PER_ROW = {phone: 3, vertical: 4, normal: 6, ultrawide: 10};
// Empile les cases KPI par lignes de {max} maximum, TOUTES DE LA MÊME TAILLE :
// contrairement à une répartition "équilibrée" (qui donnerait des cases plus
// petites sur une ligne de 8 que sur une ligne de 7), on garde ici une seule
// grille à {max} colonnes fixes pour toutes les lignes ; la dernière ligne
// incomplète est complétée par des cases vides (juste le fond), exactement
// comme en mode téléphone.
function cfBalancedRowSizes(total, maxPerRow) {
  const rows = Math.max(1, Math.ceil(total / maxPerRow));
  const sizes = [];
  for (let i = 0; i < rows; i++) sizes.push(maxPerRow);
  return sizes;
}
// Réorganise le DOM des cases KPI en lignes :
//  - Téléphone : toujours des lignes de 3, complétées par des cases vides
//    (juste le fond, pas de contenu) si la dernière ligne n'est pas pleine —
//    les cases ne changent jamais de taille.
//  - PC (vertical / normal / ultra wide) : une seule ligne tant qu'il y a
//    moins de cases que le maximum du mode (elles se partagent alors la
//    largeur totale, donc rétrécissent progressivement) ; au-delà,
//    répartition sur plusieurs lignes de {max} maximum, toutes de la même
//    taille.
function cfLayoutKpiStrip() {
  const strip = document.querySelector('#page-trackrecord .kpi-strip');
  if (!strip) return;
  const cards = Array.from(strip.querySelectorAll('.kpi-card:not(.cf-kpi-placeholder)'));
  const n = cards.length;
  if (!n) return;
  strip.querySelectorAll('.cf-kpi-row').forEach(row => {
    Array.from(row.children).forEach(ch => {
      if (ch.classList.contains('kpi-card') && !ch.classList.contains('cf-kpi-placeholder'))
        strip.appendChild(ch);
    });
    row.remove();
  });
  const rowBg = gc('--kpi-strip-background') || '#1e2d45';
  const maxPerRow = CF_KPI_MAX_PER_ROW[cfScreenMode()] || CF_KPI_MAX_PER_ROW.normal;
  if (cfIsMobile()) {
    strip.style.display = 'flex';
    strip.style.flexDirection = 'column';
    strip.style.gap = '1px';
    strip.style.gridTemplateColumns = '';
    const rowSize = maxPerRow;
    const rows = Math.ceil(n / rowSize);
    for (let r = 0; r < rows; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'cf-kpi-row';
      rowEl.style.cssText =
        'display:grid;grid-template-columns:repeat(' +
        rowSize +
        ',1fr);gap:1px;background:' +
        rowBg +
        ';';
      for (let i = 0; i < rowSize; i++) {
        const idx = r * rowSize + i;
        if (idx < n) rowEl.appendChild(cards[idx]);
        else {
          const ph = document.createElement('div');
          ph.className = 'kpi-card cf-kpi-placeholder';
          rowEl.appendChild(ph);
        }
      }
      strip.appendChild(rowEl);
    }
    return;
  }
  if (n <= maxPerRow) {
    strip.style.display = 'grid';
    strip.style.flexDirection = '';
    strip.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
    strip.style.gap = '1px';
    cards.forEach(c => strip.appendChild(c));
  } else {
    strip.style.display = 'flex';
    strip.style.flexDirection = 'column';
    strip.style.gap = '1px';
    strip.style.gridTemplateColumns = '';
    const sizes = cfBalancedRowSizes(n, maxPerRow);
    let idx = 0;
    sizes.forEach(size => {
      const rowEl = document.createElement('div');
      rowEl.className = 'cf-kpi-row';
      rowEl.style.cssText =
        'display:grid;grid-template-columns:repeat(' +
        size +
        ',1fr);gap:1px;background:' +
        rowBg +
        ';';
      for (let i = 0; i < size; i++) {
        if (idx < n) {
          rowEl.appendChild(cards[idx]);
          idx++;
        } else {
          const ph = document.createElement('div');
          ph.className = 'kpi-card cf-kpi-placeholder';
          rowEl.appendChild(ph);
        }
      }
      strip.appendChild(rowEl);
    });
  }
}

// ── Zone graphiques/widgets du Track Record ──
// Système de largeur : grille à 6 colonnes. Pleine largeur = span 6,
// demi-largeur = span 3, tiers = span 2. grid-auto-flow:row dense permet aux
// graphiques de largeur réduite de se caler naturellement les uns à côté des
// autres (ou à côté d'un graphique plein qui laisse un trou), sans calcul
// manuel de "qui va sur quelle ligne".
function cfEnsureChartsContainer() {
  if (document.getElementById('chartsContainer')) return;
  const eqCanvas = document.getElementById('cEq');
  if (!eqCanvas) return;
  const eqCard = eqCanvas.closest('.chart-card');
  const pnlCard =
    document.getElementById('cPnl') && document.getElementById('cPnl').closest('.chart-card');
  const riskCard = document.getElementById('riskCard');
  const pieCard =
    document.getElementById('cPie') && document.getElementById('cPie').closest('.chart-card');
  const mgmtCard =
    document.getElementById('cMgmt') && document.getElementById('cMgmt').closest('.chart-card');
  const top5El = document.getElementById('top5trades');
  const worst5El = document.getElementById('worst5trades');
  const top5Card = top5El && top5El.closest('.card');
  const worst5Card = worst5El && worst5El.closest('.card');
  if (!eqCard || !pnlCard || !riskCard || !pieCard || !mgmtCard) return;

  const container = document.createElement('div');
  container.id = 'chartsContainer';
  container.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
  eqCard.parentNode.insertBefore(container, eqCard);

  eqCard.dataset.chartId = 'eq';
  container.appendChild(eqCard);
  pnlCard.dataset.chartId = 'pnl';
  container.appendChild(pnlCard);
  riskCard.dataset.chartId = 'risk';
  container.appendChild(riskCard);

  const twoColWrap = pieCard.parentElement;
  pieCard.dataset.chartId = 'pie';
  // Le Win Rate natif avait ses propres dimensions (220px / canevas 195px)
  // et un fond dédié (--winrate-body-bg), différents du gabarit des
  // camemberts custom (cfEnsureChartNode) : on les aligne ici sur les mêmes
  // constantes partagées (CF_PIE_ZONE_HEIGHT / CF_PIE_CANVAS_MAX) pour que
  // les deux soient rigoureusement identiques, au pixel près.
  // IMPORTANT : Chart.js dimensionne un canevas "responsive" d'après la
  // taille de son PARENT DIRECT, pas d'après un max-width/max-height posé
  // sur le canevas lui-même (ça ne suffit pas à le contraindre de façon
  // fiable — sans ça le camembert peut se retrouver énorme et rogné sur un
  // écran étroit). On enveloppe donc le canevas dans un conteneur à taille
  // FIXE (pas juste "max"), et c'est CE conteneur, pas le canevas, qui porte
  // la contrainte de taille.
  const winrateBody = document.getElementById('winrateBody');
  const pieCanvas = document.getElementById('cPie');
  if (winrateBody) {
    winrateBody.classList.add('cf-pie-body', 'cf-pie-zone');
    winrateBody.style.height = '';
    winrateBody.style.background = '';
  }
  if (pieCanvas && !pieCanvas.dataset.cfWrapped) {
    pieCanvas.dataset.cfWrapped = '1';
    pieCanvas.style.maxWidth = '';
    pieCanvas.style.maxHeight = '';
    const wrap = document.createElement('div');
    wrap.className = 'cf-pie-canvas-wrap';
    pieCanvas.parentNode.insertBefore(wrap, pieCanvas);
    wrap.appendChild(pieCanvas);
  }
  // Force un premier rendu à travers notre patch de drawPie (voir plus bas) :
  // si le tout premier rendu natif a eu lieu avant que ce fichier n'ait la
  // main, il l'a fait avec la légende et le rayon d'origine, jamais corrigés
  // depuis faute d'un nouvel appel à drawPie() derrière.
  if (typeof window.drawPie === 'function' && typeof ST !== 'undefined') {
    try {
      window.drawPie(ST.pie || 'tout');
    } catch (e) {}
  }
  container.appendChild(pieCard);
  mgmtCard.dataset.chartId = 'mgmt';
  container.appendChild(mgmtCard);
  if (twoColWrap && twoColWrap.classList.contains('two-col') && !twoColWrap.children.length)
    twoColWrap.remove();

  const compDiv = document.getElementById('compCharts');
  if (compDiv) {
    const canvasMap = {
      cConf: 'conf',
      cPairs: 'pairs',
      cSessions: 'sessions',
      cJours: 'jours',
      cTF: 'tf'
    };
    Array.from(compDiv.children).forEach(card => {
      const canvas = card.querySelector('canvas');
      const cid = canvas ? canvasMap[canvas.id] : null;
      if (cid) card.dataset.chartId = cid;
      container.appendChild(card);
    });
  }

  // Top 5 / Pires 5 : DÉLIBÉRÉMENT hors de #chartsContainer, dans une zone
  // séparée juste en dessous. Le "grid-auto-flow:row dense" utilisé pour que
  // les graphiques 1/2 se calent naturellement les uns à côté des autres a
  // pour effet de bord de recaser N'IMPORTE QUEL élément (même en dernière
  // position dans le DOM) dans un trou plus haut si sa taille le permet — il
  // n'y a donc AUCUN moyen fiable de garder Top5/Pires5 "toujours tout en
  // bas" s'ils font partie de cette même grille dense. D'où cette séparation
  // stricte en dehors, qui garantit leur position par construction (et non
  // par convention), sur PC comme sur téléphone.
  let bottomRow = document.getElementById('cfBottomRow');
  if (!bottomRow && top5Card && worst5Card) {
    bottomRow = document.createElement('div');
    bottomRow.id = 'cfBottomRow';
    bottomRow.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;';
    container.parentNode.insertBefore(bottomRow, container.nextSibling);
    const top5TwoCol = top5Card.parentElement;
    top5Card.dataset.chartId = 'top5';
    bottomRow.appendChild(top5Card);
    worst5Card.dataset.chartId = 'pires5';
    bottomRow.appendChild(worst5Card);
    if (top5TwoCol && top5TwoCol.classList.contains('two-col') && !top5TwoCol.children.length)
      top5TwoCol.remove();
  }

  const style = document.createElement('style');
  style.id = 'cfInjectedStyle';
  style.textContent = `
.cf-stat-card{display:flex;align-items:center;justify-content:center;padding:14px;}
.cf-stat-inner{text-align:center;}
.cf-stat-label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.cf-stat-value{font-family:var(--mono);font-size:20px;font-weight:700;}
.cf-shape-rect{max-width:360px;min-height:90px;margin:0 auto;}
.cf-pie-body{display:flex;align-items:center;justify-content:center;}
/* !important à dessein : le Win Rate natif gardait une zone plus grande que
   les camemberts custom malgré une valeur JS identique (winrateBody.style.height) —
   une classe !important est la garantie la plus forte possible que rien
   d'autre (règle CSS, style inline posé ailleurs, etc.) ne puisse plus
   jamais la faire dévier. */
.cf-pie-zone{height:${CF_PIE_ZONE_HEIGHT}px!important;}
.cf-pie-canvas-wrap{width:${CF_PIE_CANVAS_MAX}px!important;height:${CF_PIE_CANVAS_MAX}px!important;}
/* .chart-card a un margin-bottom:16px par défaut (style.css) — pertinent
   hors de #chartsContainer, mais ici l'espacement entre lignes est déjà
   géré par le gap:16px du conteneur (voir cfEnsureChartsContainer). Sans ce
   reset, les cartes natives (qui avaient margin-bottom:0 en dur depuis leur
   ancien emplacement en grille .two-col) et les cartes custom (qui gardent
   le 16px par défaut, jamais réinitialisé) n'avaient pas le même
   espacement vertical total — 16px pour les unes, 32px (margin + gap) pour
   les autres. Une seule règle, appliquée à TOUTES les cartes du conteneur
   sans distinction, plutôt qu'un correctif carte par carte. */
#chartsContainer>.chart-card{margin-bottom:0;}
@media(max-width:700px){#cfBottomRow{grid-template-columns:1fr!important;}}
/* Correctif du 16/09/2026 : la media query générale (@media max-width:1100px,
   style.css) empile le bouton BT et les choix de période sous le titre dès
   qu'un écran est plus étroit que ça — ce qui inclut la plupart des
   moniteurs PC tournés à la verticale (souvent ~1080px de large), qui
   doivent pourtant rester en disposition "PC" (contrôles à droite du
   titre), comme en mode normal/ultra wide. On force donc la ligne dès que
   le mode vertical est actif, quelle que soit la largeur réelle. */
body.cf-mode-vertical .chart-header{
  flex-direction:row!important;
  align-items:center!important;
  gap:8px!important;
}
body.cf-mode-vertical .chart-title{width:auto!important;}
body.cf-mode-vertical .period-btns{width:auto!important;}
/* Un graphique doit toujours s'étirer pour occuper toute la place
   disponible sur sa ligne (2 camemberts seuls entre eux → 50% chacun, 3 →
   33% chacun, etc.) — jamais rester à une taille fixe alors qu'il reste de
   la place vide. flex-grow:1 fait exactement ça : la part "basis" de
   chacun n'est qu'un MINIMUM, la place restante se répartit à parts égales
   entre tous les éléments qui peuvent grossir sur la ligne.
   flex-shrink:0 sur le camembert donne GRATUITEMENT le plafond par ligne du
   mode (ex. 6 en ultra wide), sans bidouille de retour à la ligne forcé :
   une fois N camemberts alignés à 100/N% chacun (leur minimum), la ligne
   est exactement pleine ; comme aucun ne peut rétrécir davantage pour
   laisser de la place à un (N+1)-ième, celui-ci est automatiquement
   repoussé à la ligne suivante par le flex-wrap normal du navigateur. */
.cf-flex-full{flex:1 1 100%;}
.cf-flex-pie{flex:1 0 var(--cf-pie-basis,16.6667%);}
.cf-row-break{flex-basis:100%;width:0;height:0;margin:0;padding:0;border:0;}
`;
  document.head.appendChild(style);

  // Glisser-déposer direct retiré à la demande de Paul : un clic sur un
  // graphique (pour voir une info-bulle, cocher BT, changer de période...)
  // ne doit plus jamais pouvoir être interprété comme un début de
  // glissement. Seule la liste "ORDRE DES GRAPHIQUES" des Paramètres permet
  // désormais de réordonner (elle écrit dans la même donnée,
  // APP.cfChartOrderByMode[mode actuel], donc rien d'autre ne change).
  // Conséquence acceptée : les paires côte-à-côte (barv/other) ne peuvent
  // plus se CRÉER (ça ne se faisait que par un dépose sur le bord d'une
  // carte) — celles déjà existantes restent affichées normalement.
}
// comportement par défaut de CSS Grid (align-items:stretch) — encore faut-il
// que leur CONTENU (le corps du graphique) suive cet étirement au lieu de
// garder une hauteur fixe en pixels. On passe donc chaque carte en colonne
// flexible avec un corps extensible (flex:1) plutôt qu'une hauteur figée.
// (Désactivée) — cette fonction rendait le corps des graphiques "extensible"
// (flex + hauteur auto) pour égaliser les hauteurs par rangée. Problème :
// Chart.js redimensionne son canvas selon la hauteur de son conteneur ; sans
// hauteur de référence FIXE, ça crée une boucle (le graphique grandit → son
// conteneur grandit → Chart.js le redessine encore plus grand → ...), d'où
// l'agrandissement à l'infini constaté sur le Track Record. On revient donc
// à une hauteur fixe (comme à l'origine, sûre), et cette fonction ne touche
// plus à aucune hauteur — gardée en place uniquement pour ne pas casser les
// appels existants ailleurs dans le fichier.
function cfNormalizeChartHeights() {}
function cfChartHeaderControlsHtml(fieldId) {
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
    <label class="bt-toggle"><input type="checkbox" id="bt-${fieldId}" onchange="toggleBT('${fieldId}')"> BT</label>
    <div class="period-btns">
      <button class="pbtn" data-chart="${fieldId}" data-p="jour">J</button>
      <button class="pbtn" data-chart="${fieldId}" data-p="semaine">SEM</button>
      <button class="pbtn" data-chart="${fieldId}" data-p="mois">MOIS</button>
      <button class="pbtn" data-chart="${fieldId}" data-p="trimestre">TRIM</button>
      <button class="pbtn" data-chart="${fieldId}" data-p="annee">AN</button>
      <button class="pbtn active" data-chart="${fieldId}" data-p="tout">TOUT</button>
    </div>
  </div>`;
}
function cfEnsureChartState(fieldId) {
  if (!(fieldId in BT_STATE)) BT_STATE[fieldId] = false;
  if (!(fieldId in ST)) ST[fieldId] = 'tout';
}
function cfEnsureChartNode(field) {
  let card = document.getElementById('cfcard-' + field.id);
  const container = document.getElementById('chartsContainer');
  if (!container) return null;
  cfEnsureChartState(field.id);
  if (!card) {
    card = document.createElement('div');
    card.id = 'cfcard-' + field.id;
    card.className = 'chart-card';
    card.dataset.chartId = field.id;
    card.style.background = 'var(--card)';
    const isPie = field.widget.kind === 'pie';
    const bodyClass = isPie ? 'chart-body cf-pie-body cf-pie-zone' : 'chart-body';
    const bodyHeight = isPie ? '' : ' style="height:220px"';
    // Chart.js dimensionne un canevas "responsive" d'après son PARENT
    // DIRECT — un max-width/max-height posé sur le canevas lui-même ne le
    // contraint pas de façon fiable (camembert énorme et rogné sur écran
    // étroit). On enveloppe donc le canevas dans un conteneur à taille FIXE
    // (même classe !important que le Win Rate natif, cf-pie-canvas-wrap,
    // pour garantir une taille rigoureusement identique aux deux).
    const canvasHtml = isPie
      ? `<div class="cf-pie-canvas-wrap"><canvas id="cfchart-${field.id}"></canvas></div>`
      : `<canvas id="cfchart-${field.id}"></canvas>`;
    card.innerHTML = `<div class="chart-header"><div class="chart-title" data-editable data-tvar="--cf-${field.id}-title" id="cftitle-${field.id}" style="color:var(--cf-${field.id}-title,#00e5a0)">${escapeHtml((field.colName || field.label).toUpperCase())}</div>${cfChartHeaderControlsHtml(field.id)}</div>
      <div class="${bodyClass}"${bodyHeight}>${canvasHtml}</div>`;
    container.appendChild(card);
  }
  return card;
}
function cfEnsureStatCardNode(field) {
  let card = document.getElementById('cfcard-' + field.id);
  const container = document.getElementById('chartsContainer');
  if (!container) return null;
  if (!card) {
    card = document.createElement('div');
    card.id = 'cfcard-' + field.id;
    card.dataset.chartId = field.id;
    card.className = 'chart-card cf-stat-card cf-shape-rect';
    card.innerHTML = `<div class="cf-stat-inner"><div class="cf-stat-label" data-editable id="cflabel-${field.id}">${escapeHtml(field.colName || field.label)}</div><div class="cf-stat-value" id="cfstatval-${field.id}">—</div></div>`;
    container.appendChild(card);
  }
  return card;
}
function cfDrawChart(field) {
  const canvasEl = document.getElementById('cfchart-' + field.id);
  destroy(field.id);
  if (!canvasEl || typeof Chart === 'undefined') return;
  const ctx = canvasEl.getContext('2d');
  const kind = field.widget.kind;
  cfEnsureChartState(field.id);
  const period = ST[field.id] || 'tout';
  const trades = typeof btFilter === 'function' ? btFilter(field.id, period) : realTrades();
  const axC = gc('--comp-axis') || '#64748b',
    grC = gc('--comp-grid') || 'rgba(100,116,139,.1)';
  if (kind === 'line') {
    const trs = trades
      .filter(t => {
        const v = t['cf_' + field.id];
        return v !== undefined && v !== '' && !isNaN(parseFloat(v));
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || ''));
    if (!trs.length) return;
    const data = trs.map(t => parseFloat(t['cf_' + field.id]));
    const labels =
      typeof buildLabels === 'function' ? buildLabels(trs, period) : trs.map(t => t.date);
    const lc = gc('--cf-' + field.id + '-line') || '#00e5a0';
    const ftop = gc('--cf-' + field.id + '-fill-top') || 'rgba(0,229,160,.32)',
      fbot = gc('--cf-' + field.id + '-fill-bot') || 'rgba(0,229,160,0)';
    const g = ctx.createLinearGradient(0, 0, 0, 210);
    g.addColorStop(0, ftop);
    g.addColorStop(1, fbot);
    CH[field.id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: lc,
            backgroundColor: g,
            borderWidth: 2.5,
            fill: true,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Comme Équity natif : le point le plus proche sur l'axe des dates, sans
        // devoir viser exactement le point (il n'est pas dessiné).
        interaction: {mode: 'index', intersect: false},
        // Clic sur un point : la liste des trades analysés à cet endroit (ici 1 trade),
        // comme sur les graphiques natifs.
        onClick: (evt, elements) => {
          if (!elements.length || typeof openTradesListModal !== 'function') return;
          const t = trs[elements[0].index];
          if (t) openTradesListModal('Trade : ' + (t.paire || '—') + ' du ' + (t.date || ''), [t]);
        },
        onHover: cfChartHover,
        plugins: {
          legend: {display: false},
          // Manquait par rapport à Équity/P&L natifs : sans ça, l'info-bulle
          // par défaut de Chart.js affiche la valeur brute, sans € ni
          // séparateur de milliers.
          tooltip: {
            callbacks: {
              label: i =>
                ' ' +
                (field.colName || field.label) +
                ' : ' +
                i.parsed.y.toLocaleString('fr-FR') +
                '€'
            }
          }
        },
        scales: {
          // maxTicksLimit aligné sur 12 comme Équity native (était 10)
          x: {grid: {color: grC}, ticks: {color: axC, maxTicksLimit: 12, maxRotation: 30}},
          y: {
            grid: {color: grC},
            // Même formatage € manquant que ci-dessus, sur l'axe cette fois
            ticks: {color: axC, callback: v => v.toLocaleString('fr-FR') + '€'}
          }
        }
      }
    });
    return;
  }
  if (kind === 'bar-v' || kind === 'bar-h') {
    const map = cfCategoryStats(field, trades);
    // Les barres restent triées par performance (plus grand en haut, plus
    // petit en bas), quel que soit le type de champ. Seul le camembert suit
    // l'ordre du menu déroulant (Listes personnalisables) — voir cfDrawChart,
    // branche "pie".
    const ks = Object.keys(map)
      .sort((a, b) => map[b].pnl - map[a].pnl)
      .slice(0, 20);
    if (!ks.length) return;
    const data = ks.map(k => map[k].pnl);
    const mapTrades = cfTradesByCategory(field, trades);
    const posC = gc('--cf-' + field.id + '-pos') || 'rgba(0,229,160,.8)',
      negC = gc('--cf-' + field.id + '-neg') || 'rgba(239,68,68,.8)';
    const valueAxis = kind === 'bar-h' ? 'x' : 'y',
      catAxis = kind === 'bar-h' ? 'y' : 'x';
    const scales = {};
    scales[valueAxis] = {
      grid: {color: grC},
      ticks: {color: axC, callback: v => (v >= 0 ? '+' : '') + v + '€'}
    };
    scales[catAxis] = {grid: {color: grC}, ticks: {color: '#e2e8f0'}};
    CH[field.id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ks,
        datasets: [
          {
            data,
            backgroundColor: data.map(v => (v >= 0 ? posC : negC)),
            borderRadius: 4,
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: kind === 'bar-h' ? 'y' : 'x',
        // Clic sur une barre : la liste des trades analysés dans cette barre, comme
        // sur les graphiques de comparaison natifs (Confluence, Paire...).
        onClick: (evt, elements) => {
          if (!elements.length || typeof openTradesListModal !== 'function') return;
          const k = ks[elements[0].index];
          openTradesListModal((field.colName || field.label) + ' : ' + k, mapTrades[k] || []);
        },
        onHover: cfChartHover,
        plugins: {
          legend: {display: false},
          // Manquait par rapport aux graphiques de comparaison natifs
          // (Confluence, Paire...) : sans ça, l'info-bulle par défaut de
          // Chart.js affiche la valeur brute, sans signe ni séparateur de
          // milliers ni €.
          tooltip: {
            callbacks: {
              label: i =>
                ' ' +
                (i.parsed[valueAxis] >= 0 ? '+' : '') +
                i.parsed[valueAxis].toLocaleString('fr-FR') +
                '€'
            }
          }
        },
        scales
      }
    });
    return;
  }
  if (kind === 'pie') {
    const map = cfCategoryStats(field, trades);
    const ks = cfCategoryOrder(field, map).slice(0, cfPieSliceCount(field));
    if (!ks.length) return;
    const data = ks.map(k => map[k].total);
    const mapTrades = cfTradesByCategory(field, trades);
    const fallback = [
      '#00e5a0',
      '#3b82f6',
      '#f59e0b',
      '#ef4444',
      '#a78bfa',
      '#f472b6',
      '#22d3ee',
      '#84cc16'
    ];
    const palette = ks.map(
      (k, i) => gc('--cf-' + field.id + '-slice-' + (i + 1)) || fallback[i % fallback.length]
    );
    // Pas de légende : les catégories s'identifient déjà via l'info-bulle
    // au clic/survol d'une part du camembert. Ça évite aussi que le nombre
    // de catégories fasse varier la place disponible pour l'anneau — chaque
    // camembert garde ainsi le même rayon fixe (CF_PIE_RADIUS) quel que
    // soit le nombre de catégories.
    const pieTotal = data.reduce((s, v) => s + v, 0);
    CH[field.id] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ks,
        datasets: [
          {
            data,
            backgroundColor: palette,
            // Même variable de thème que le Win Rate natif (--winrate-slice-border,
            // réglable dans Paramètres) — pas une couleur figée en dur, pour que
            // les deux restent identiques même si cette couleur est personnalisée.
            borderColor: gc('--winrate-slice-border') || '#0b0f1a',
            borderWidth: 3,
            hoverOffset: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '60%',
        radius: CF_PIE_RADIUS,
        // Les 2 paramètres suivants manquaient par rapport au Win Rate natif
        // (repérés en comparant point par point) :
        layout: {padding: {bottom: 8}},
        // Clic sur une tranche : la liste des trades analysés dans cette tranche,
        // comme sur le Win Rate natif.
        onClick: (evt, elements) => {
          if (!elements.length || typeof openTradesListModal !== 'function') return;
          const k = ks[elements[0].index];
          openTradesListModal((field.colName || field.label) + ' : ' + k, mapTrades[k] || []);
        },
        onHover: cfChartHover,
        plugins: {
          legend: {display: false},
          tooltip: {
            callbacks: {
              label: i =>
                ' ' +
                i.label +
                ' : ' +
                i.parsed +
                (pieTotal ? ' (' + Math.round((i.parsed / pieTotal) * 100) + '%)' : '')
            }
          }
        }
      }
    });
  }
}
function cfRenderCustomCharts() {
  cfEnsureChartsContainer();
  const container = document.getElementById('chartsContainer');
  if (!container) return;
  APP.cfFields.forEach(f => {
    const kind = f.widget && f.widget.kind;
    if (!kind || kind === 'none' || kind === 'kpi') return;
    if (kind === 'card') {
      cfEnsureStatCardNode(f);
      const el = document.getElementById('cfstatval-' + f.id);
      if (el) {
        el.textContent = cfKpiValueText(f);
        el.style.color = gc('--cf-' + f.id + '-color') || '#00e5a0';
      }
    } else {
      cfEnsureChartNode(f);
      cfDrawChart(f);
    }
  });
  container.querySelectorAll('[id^="cfcard-"]').forEach(el => {
    const id = el.id.replace('cfcard-', '');
    const f = APP.cfFields.find(x => x.id === id);
    const stillChart = f && f.widget && CF_CHART_WIDGET_KINDS.includes(f.widget.kind);
    if (!stillChart) {
      destroy(id);
      el.remove();
    }
  });
  if (typeof applyPencilEdits === 'function') applyPencilEdits();
}
function cfApplyChartOrder() {
  const container = document.getElementById('chartsContainer');
  if (!container) return;
  cfEnsureOrders();
  const map = {};
  Array.from(container.children).forEach(card => {
    if (card.dataset.chartId) map[card.dataset.chartId] = card;
  });
  const order = APP.cfChartOrderByMode[cfScreenMode()] || CF_BUILTIN_CHARTS.map(c => c.id);
  order.forEach(id => {
    if (map[id]) container.appendChild(map[id]);
  });
}
// ── Système de mode d'affichage (4 profils d'écran) ──
// - "phone"     : téléphone — largeur ≤ 700px, quelle que soit l'orientation
// - "vertical"  : écran PC en orientation portrait (moniteur tourné à la
//   verticale) — largeur > 700px et plus haut que large
// - "ultrawide" : écran PC très large (ratio largeur/hauteur ≥ 2/1, ex.
//   21:9, 32:9)
// - "normal"    : PC/laptop classique (tout le reste)
// Recalculé à la volée via matchMedia (voir les écouteurs de breakpoint en
// bas de fichier) — aucune donnée n'est stockée, c'est purement dérivé de la
// taille d'écran réelle à l'instant T. SAUF si un mode est forcé manuellement
// (sélecteur "Mode d'affichage" dans Paramètres > Préférences) : ce réglage
// est local à CET appareil (pas synchronisé cloud, exprès — un forçage n'a de
// sens que sur l'appareil dont l'écran est mal détecté) et prend le dessus
// sur toute détection automatique.
// Le forçage est propre à CHAQUE ÉCRAN PHYSIQUE (identifié par sa résolution
// native, indépendante du zoom ou de la taille de la fenêtre) : un mode forcé
// sur un moniteur ne s'applique plus quand la fenêtre passe sur un autre
// écran — celui-ci retombe sur "auto" tant qu'aucun forçage ne lui est
// propre.
function cfScreenKey() {
  try {
    return `${screen.width}x${screen.height}`;
  } catch (e) {
    return 'default';
  }
}
function cfModeOverrideMap() {
  const map = ls('tj_mode_override_by_screen', null);
  if (map) return map;
  // Migration depuis l'ancien réglage unique (avant le correctif du
  // 12/09/2026, un seul écran géré à la fois) : repris pour l'écran actuel.
  const legacy = ls('tj_mode_override', 'auto');
  const migrated = {};
  if (CF_SCREEN_MODES.includes(legacy)) migrated[cfScreenKey()] = legacy;
  lss('tj_mode_override_by_screen', migrated);
  return migrated;
}
function cfModeOverride() {
  const v = cfModeOverrideMap()[cfScreenKey()];
  return CF_SCREEN_MODES.includes(v) ? v : 'auto';
}
function cfSetModeOverride(v) {
  const map = cfModeOverrideMap();
  if (CF_SCREEN_MODES.includes(v)) map[cfScreenKey()] = v;
  else delete map[cfScreenKey()];
  lss('tj_mode_override_by_screen', map);
  cfRecomputeLayout();
}
function cfScreenMode() {
  const forced = cfModeOverride();
  if (forced !== 'auto') return forced;
  if (window.matchMedia && window.matchMedia('(max-width:700px)').matches) return 'phone';
  if (window.matchMedia && window.matchMedia('(orientation:portrait)').matches) return 'vertical';
  if (window.matchMedia && window.matchMedia('(min-aspect-ratio:2/1)').matches) return 'ultrawide';
  return 'normal';
}
function cfIsMobile() {
  return cfScreenMode() === 'phone';
}
// Nombre maximum d'éléments par ligne, par groupe de graphique et par mode.
// Pour "pie" : automatique, comme avant (tous les camemberts s'assemblent
// tout seuls jusqu'à ce maximum). Pour "barv"/"other" : ce nombre n'est plus
// automatique, c'est désormais la TAILLE MAXIMALE d'une série liée à la main
// (voir cfChartLinksByMode plus bas) — deux graphiques de comparaison
// adjacents ne partagent une ligne QUE si Paul a explicitement déposé l'un
// sur le côté de l'autre ; sinon, chacun reste seul sur sa ligne (100%),
// même côte à côte dans l'ordre.
const CF_CHART_MAX_PER_ROW = {
  phone: {pie: 1, barv: 1, other: 1},
  vertical: {pie: 3, barv: 1, other: 1},
  normal: {pie: 4, barv: 2, other: 1},
  ultrawide: {pie: 6, barv: 3, other: 2}
};
// Chaque graphique appartient à un "groupe" : deux graphiques de groupes
// différents ne doivent JAMAIS se retrouver sur la même ligne, même s'il
// reste de la place.
//  - "pie"   : tous les camemberts (natif Win Rate + custom) — s'assemblent
//    AUTOMATIQUEMENT jusqu'au maximum du mode, comme avant.
//  - "barv"  : tous les graphiques en barres VERTICALES (Impact du
//    management, natif, + barres verticales custom) — ne partagent une ligne
//    que par liaison EXPLICITE (glisser-déposer sur le côté).
//  - "other" : les graphiques en barres HORIZONTALES (Confluence, Paire,
//    Session, Jour, Timeframe, natifs, + barres horizontales custom) — même
//    principe que "barv" : liaison explicite uniquement.
//  - "solo-<id>" : Évolution du capital, P&L et Risk Management restent
//    TOUJOURS seuls sur leur ligne, dans tous les modes — jamais concernés
//    par aucun regroupement, ni automatique ni par liaison.
function cfChartGroup(el) {
  const id = el.dataset.chartId;
  if (id === 'pie') return 'pie';
  if (id === 'mgmt') return 'barv';
  if (id === 'conf' || id === 'pairs' || id === 'sessions' || id === 'jours' || id === 'tf')
    return 'other';
  const f = APP.cfFields.find(x => x.id === id);
  if (f && f.widget) {
    if (f.widget.kind === 'pie') return 'pie';
    if (f.widget.kind === 'bar-v') return 'barv';
    if (f.widget.kind === 'bar-h') return 'other';
  }
  return 'solo-' + id;
}
// Liaisons explicites (paires côte-à-côte) du mode actuel, sous forme d'un
// Set de clés "idGauche|idDroite" — ne se créent plus (le glisser-déposer
// qui les posait a été retiré), ne servent plus qu'à afficher correctement
// celles déjà existantes. cfEnsureOrders() les nettoie (adjacence toujours
// valide, graphiques existants).
function cfCurrentLinks() {
  cfEnsureOrders();
  return new Set(APP.cfChartLinksByMode[cfScreenMode()] || []);
}
function cfApplyChartLayout() {
  const container = document.getElementById('chartsContainer');
  if (!container) return;
  const maxes = CF_CHART_MAX_PER_ROW[cfScreenMode()] || CF_CHART_MAX_PER_ROW.normal;
  // Espacement entre cartes de graphiques : 8px dans tous les modes
  // (18/09/2026, demande de Paul — auparavant 16px par défaut, réduit à 8px
  // uniquement en mode "PC vertical" le 16/09/2026). Recalculé à chaque
  // passage ici (resize, changement de mode...), pas seulement à la
  // création du conteneur.
  const gap = 8;
  container.style.gap = gap + 'px';
  // #chartsContainer a un gap entre les cartes (voir ci-dessus) — un simple
  // pourcentage (100/N%) ne le soustrait pas, donc N cartes débordaient de
  // (N-1)*gap et une carte de trop était rejetée à la ligne suivante.
  // calc() soustrait explicitement la place prise par les gaps.
  container.style.setProperty(
    '--cf-pie-basis',
    'calc((100% - ' + (maxes.pie - 1) * gap + 'px) / ' + maxes.pie + ')'
  );
  container.querySelectorAll('.cf-row-break').forEach(el => el.remove());
  const children = Array.from(container.children);
  const links = cfCurrentLinks();
  children.forEach(el => {
    el.classList.remove('cf-flex-full', 'cf-flex-pie');
    el.style.removeProperty('flex');
    el.style.removeProperty('grid-column');
    el.style.removeProperty('margin-top');
  });
  // Un camembert seul ou en petit nombre sur sa ligne s'étire toujours pour
  // occuper toute la place disponible (cf-flex-pie : flex-grow:1) — la part
  // ci-dessus n'est qu'un minimum. flex-shrink:0 donne gratuitement le
  // plafond par ligne du mode : une fois ce minimum atteint par N
  // camemberts, la ligne est pleine et, comme aucun ne peut rétrécir
  // davantage, un (N+1)-ième est naturellement repoussé à la ligne
  // suivante par le flex-wrap du navigateur — inutile de forcer quoi que ce
  // soit à la main. Les "barv"/"other" sont traités par série CONSÉCUTIVE
  // explicitement liée : une série de taille 1 (par défaut) prend 100%,
  // une série liée de taille N prend 100/N% chacun (gap déjà déduit) —
  // plafonnée au maximum du mode pour ce groupe (une liaison ne peut
  // jamais dépasser cette taille).
  let i = 0;
  let prevGroup = null;
  while (i < children.length) {
    const el = children[i];
    const group = cfChartGroup(el);
    const isNewGroup = group !== prevGroup;
    if (group === 'pie') {
      // Un camembert seul ne suffit pas à savoir combien de camemberts
      // consécutifs partagent sa 1ère ligne (jusqu'à maxes.pie) : il faut
      // TOUS les marquer ensemble ci-dessous, sinon seul le premier
      // remonterait et ils se désaligneraient verticalement entre eux.
      let runEnd = i;
      while (
        runEnd - i + 1 < maxes.pie &&
        runEnd + 1 < children.length &&
        cfChartGroup(children[runEnd + 1]) === 'pie'
      ) {
        runEnd++;
      }
      for (let k = i; k <= runEnd; k++) {
        children[k].classList.add(maxes.pie <= 1 ? 'cf-flex-full' : 'cf-flex-pie');
        if (isNewGroup && i > 0) children[k].style.marginTop = '-' + gap + 'px';
      }
      prevGroup = 'pie';
      i = runEnd + 1;
      continue;
    }
    if (group === 'barv' || group === 'other') {
      const cap = maxes[group] || 1;
      let runEnd = i;
      while (
        runEnd - i + 1 < cap &&
        runEnd + 1 < children.length &&
        cfChartGroup(children[runEnd + 1]) === group &&
        links.has(
          children[runEnd].dataset.chartId + '|' + children[runEnd + 1].dataset.chartId
        )
      ) {
        runEnd++;
      }
      const runSize = runEnd - i + 1;
      const basisPct =
        runSize > 1 ? 'calc((100% - ' + (runSize - 1) * gap + 'px) / ' + runSize + ')' : '100%';
      for (let k = i; k <= runEnd; k++) {
        children[k].style.flex = '1 1 ' + basisPct;
        if (isNewGroup && i > 0) children[k].style.marginTop = '-' + gap + 'px';
      }
      prevGroup = group;
      i = runEnd + 1;
      continue;
    }
    el.classList.add('cf-flex-full');
    if (isNewGroup && i > 0) el.style.marginTop = '-' + gap + 'px';
    prevGroup = group;
    i++;
  }
  // Sépare deux groupes différents consécutifs par un séparateur de ligne
  // invisible (flex-basis:100%, hauteur 0) : un élément à 100% de large
  // force forcément un retour à la ligne juste après lui, ce qui empêche
  // tout mélange entre groupes sans jamais limiter à un nombre fixe de
  // lignes — il y en a exactement autant que nécessaire. Ce séparateur
  // ajoute mécaniquement un gap supplémentaire (gap + séparateur + gap =
  // 2×gap au lieu de 1×) : une marge négative posée sur LE SÉPARATEUR
  // lui-même n'a aucun effet mesurable (vérifié par rendu réel,
  // 18/09/2026) — elle est donc posée ci-dessus, sur les vrais graphiques
  // de la ligne qui suit ce changement de groupe, ce qui annule
  // effectivement le surplus et redonne 1×gap partout, y compris entre 2
  // camemberts côte à côte (demande de Paul).
  for (let idx = children.length - 1; idx >= 1; idx--) {
    if (cfChartGroup(children[idx]) !== cfChartGroup(children[idx - 1])) {
      const spacer = document.createElement('div');
      spacer.className = 'cf-row-break';
      container.insertBefore(spacer, children[idx]);
    }
  }
}

// ── Intégration thème ──
function cfBuildThemeVars() {
  const out = [];
  out.push({
    v: '--history-grid-color',
    l: 'Quadrillage (lignes/colonnes)',
    page: 'Journal de trading',
    section: 'Historique des trades'
  });
  APP.cfFields
    .filter(f => f.type === 'select')
    .forEach(f => {
      out.push({
        v: '--mt-cf-' + f.id,
        l: 'Titre ' + (f.colName || f.label),
        page: 'Paramètres',
        section: 'Listes personnalisables'
      });
    });
  // Toutes les couleurs des widgets/graphiques de champs personnalisés vivent
  // dans leur propre fenêtre de thème ("Champ personnalisé"), séparée de
  // Track Record : Cases KPI/Widget d'un côté, vrais graphiques (courbe,
  // barres, camembert) de l'autre.
  const CF_THEME_PAGE = 'Champ personnalisé';
  APP.cfFields.forEach(f => {
    const kind = f.widget && f.widget.kind;
    if (!kind || kind === 'none') return;
    const lbl = f.colName || f.label;
    if (kind === 'kpi' || kind === 'card') {
      out.push({
        v: '--cf-' + f.id + '-color',
        l: lbl + ' — couleur',
        page: CF_THEME_PAGE,
        section: 'Cases & Widgets'
      });
    } else if (kind === 'line') {
      out.push({
        v: '--cf-' + f.id + '-title',
        l: lbl + ' — titre',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      out.push({
        v: '--cf-' + f.id + '-line',
        l: lbl + ' — courbe',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      out.push({
        v: '--cf-' + f.id + '-fill-top',
        l: lbl + ' — dégradé haut',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      out.push({
        v: '--cf-' + f.id + '-fill-bot',
        l: lbl + ' — dégradé bas',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
    } else if (kind === 'bar-v' || kind === 'bar-h') {
      out.push({
        v: '--cf-' + f.id + '-title',
        l: lbl + ' — titre',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      out.push({
        v: '--cf-' + f.id + '-pos',
        l: lbl + ' — positif',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      out.push({
        v: '--cf-' + f.id + '-neg',
        l: lbl + ' — négatif',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
    } else if (kind === 'pie') {
      out.push({
        v: '--cf-' + f.id + '-title',
        l: lbl + ' — titre',
        page: CF_THEME_PAGE,
        section: 'Graphique'
      });
      const n = cfPieSliceCount(f);
      for (let i = 1; i <= n; i++) {
        const optLabel =
          f.type === 'select' && f.options && f.options[i - 1] ? f.options[i - 1] : 'tranche ' + i;
        out.push({
          v: '--cf-' + f.id + '-slice-' + i,
          l: lbl + ' — ' + optLabel,
          page: CF_THEME_PAGE,
          section: 'Graphique'
        });
      }
    }
  });
  return out;
}

// ── Paramètres : carte "Champs personnalisés" ──
// Une seule instance Sortable par liste : chaque rendu des Paramètres en créait
// une nouvelle sur le même conteneur sans détruire la précédente (glisser
// déclenchait alors plusieurs gestionnaires à la fois).
function cfMakeSortable(el, options) {
  if (!window.Sortable || !el) return null;
  const old = Sortable.get ? Sortable.get(el) : null;
  if (old) old.destroy();
  return new Sortable(el, options);
}
function cfRenderOrderList(containerId, order, labelMap, onReorder) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = order
    .map(
      id =>
        `<div class="mod-item" data-id="${escapeHtml(id)}"><span class="drag-h">⣿</span><span class="item-tx">${escapeHtml(labelMap[id] || id)}</span></div>`
    )
    .join('');
  cfMakeSortable(el, {
    animation: 120,
    handle: '.drag-h',
    onEnd: () => {
      const newOrder = Array.from(el.children).map(c => c.dataset.id);
      onReorder(newOrder);
    }
  });
}
// ── Ordre des questions du questionnaire "nouveau trade" (18/09/2026,
// demande de Paul) : stocké tel quel dans APP.cfQuestionOrder, exactement
// comme colonnes/KPI/graphiques — questions natives et personnalisées
// librement mélangeables entre elles par glisser-déposer, plus aucune
// position figée. Peut aussi contenir des "sauts de ligne" (cfIsLineBreak) :
// affichés avec un bouton de suppression, jamais de vraies questions.
function cfRenderQuestionOrderList(containerId, order, labelMap, onReorder) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = order
    .map(id => {
      if (cfIsLineBreak(id)) {
        return `<div class="mod-item" data-id="${escapeHtml(id)}"><span class="drag-h">⣿</span><span class="item-tx" style="font-style:italic;color:var(--muted);">— Saut de ligne —</span><button class="del-item" onclick="event.stopPropagation();cfRemoveLineBreak('${id}')" title="Supprimer">✕</button></div>`;
      }
      return `<div class="mod-item" data-id="${escapeHtml(id)}"><span class="drag-h">⣿</span><span class="item-tx">${escapeHtml(labelMap[id] || id)}</span></div>`;
    })
    .join('');
  cfMakeSortable(el, {
    animation: 120,
    handle: '.drag-h',
    onEnd: () => {
      const newOrder = Array.from(el.children).map(c => c.dataset.id);
      onReorder(newOrder);
    }
  });
}
function cfRenderOptionsEditor(containerEl, arr, onChange) {
  if (!containerEl) return;
  containerEl.innerHTML = arr
    .map(
      (opt, i) =>
        `<div class="mod-item"><span class="drag-h">⣿</span><span class="item-tx">${escapeHtml(opt)}</span><button class="del-item" data-i="${i}">×</button></div>`
    )
    .join('');
  containerEl.querySelectorAll('.del-item').forEach(btn => {
    btn.addEventListener('click', () => {
      arr.splice(parseInt(btn.dataset.i, 10), 1);
      cfRenderOptionsEditor(containerEl, arr, onChange);
      onChange();
    });
  });
  cfMakeSortable(containerEl, {
    animation: 120,
    handle: '.drag-h',
    onEnd: evt => {
      const [m] = arr.splice(evt.oldIndex, 1);
      arr.splice(evt.newIndex, 0, m);
      onChange();
    }
  });
}
// Éditeur d'options d'un menu déroulant personnalisé, injecté directement à
// la suite des 6 listes natives (Paires, Sessions, Confluences, Timeframes,
// Management, Reprendrais-tu ?) dans le même groupe "Listes personnalisables"
// — même structure, même comportement (glisser-déposer, ajout, couleur de
// titre modifiable via le thème ou le mode stylo). Idempotent : repart des
// blocs custom existants et les reconstruit à l'identique à chaque appel.
function cfRenderCustomDropdownLists() {
  const modGrid = document.getElementById('modGrid');
  if (!modGrid) return;
  modGrid.querySelectorAll('.mod-col[data-cf-list]').forEach(el => el.remove());
  const selectFields = APP.cfFields.filter(f => f.type === 'select');
  selectFields.forEach(f => {
    if (!f.options) f.options = [];
    const cv = '--mt-cf-' + f.id;
    const html = `<div class="mod-col" data-cf-list="${f.id}">
      <div class="mod-col-hdr"><span class="mod-col-title" data-editable id="cfmt-${f.id}" style="color:var(${cv})">${escapeHtml(f.colName || f.label)}</span><span style="font-size:9px;color:var(--muted)">${f.options.length}</span></div>
      <div class="mod-list" id="cfml-${f.id}">${f.options.map((item, i) => `<div class="mod-item"><span class="drag-h">⣿</span><span class="item-tx">${escapeHtml(item)}</span><button class="del-item" onclick="cfListRemoveOption('${f.id}',${i})">×</button></div>`).join('')}</div>
      <div class="mod-add"><input type="text" id="cfma-${f.id}" placeholder="Ajouter..." onkeydown="if(event.key==='Enter')cfListAddOption('${f.id}')"><button onclick="cfListAddOption('${f.id}')">+</button></div>
    </div>`;
    modGrid.insertAdjacentHTML('beforeend', html);
    const el = document.getElementById('cfml-' + f.id);
    if (el && window.Sortable) {
      new Sortable(el, {
        animation: 120,
        handle: '.drag-h',
        onEnd: evt => {
          const [m] = f.options.splice(evt.oldIndex, 1);
          f.options.splice(evt.newIndex, 0, m);
          cfPersist();
          cfInjectFormFields('f');
          cfInjectFormFields('e');
          if (typeof refreshAllCharts === 'function') refreshAllCharts();
        }
      });
    }
  });
  if (typeof applyPencilEdits === 'function') applyPencilEdits();
}
function cfListAddOption(fieldId) {
  const f = APP.cfFields.find(x => x.id === fieldId);
  if (!f) return;
  const inp = document.getElementById('cfma-' + fieldId);
  const v = inp.value.trim();
  if (!v || (f.options || []).includes(v)) return;
  if (!f.options) f.options = [];
  f.options.push(v);
  cfPersist();
  cfInjectFormFields('f');
  cfInjectFormFields('e');
  cfRenderCustomDropdownLists();
  if (typeof refreshAllCharts === 'function') refreshAllCharts();
}
function cfListRemoveOption(fieldId, idx) {
  const f = APP.cfFields.find(x => x.id === fieldId);
  if (!f || !f.options) return;
  f.options.splice(idx, 1);
  cfPersist();
  cfInjectFormFields('f');
  cfInjectFormFields('e');
  cfRenderCustomDropdownLists();
  if (typeof refreshAllCharts === 'function') refreshAllCharts();
}
function cfEnsureCard() {
  if (document.getElementById('cfCard')) return;
  const modGrid = document.getElementById('modGrid');
  if (!modGrid) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'cfCard';
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title" data-editable id="cfCardTitleText">CHAMPS PERSONNALISÉS</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;">
        <button class="btn btn-p" onclick="cfOpenBuilder()">+ Nouveau graphique</button>
        <button class="btn btn-g" id="cfToggleBtn" onclick="cfToggleCard()">Afficher</button>
      </div>
    </div>
    <div id="cfCardBody" style="display:none;padding:14px;">
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">Ajoute tes propres questions au questionnaire. Chaque question crée une colonne dans l'historique et, si tu veux, une case KPI ou un graphique dans le Track Record.</div>
      <div id="cfFieldsList"></div>
      <div id="cfNoFields" style="font-size:11px;color:var(--muted);padding:10px 0;">Aucun champ personnalisé pour l'instant.</div>
      <div style="margin-top:16px;">
        <button class="btn btn-g" id="cfOrderToggleBtn" onclick="cfToggleOrderSection()">▾ Ordre (questionnaire / cases à cocher / colonnes / KPI / graphiques)</button>
        <div id="cfOrderSection" style="display:none;margin-top:12px;">
          <div class="mod-col-title" style="margin-bottom:8px;">ORDRE DES QUESTIONS — NOUVEAU TRADE</div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px;">Questions natives et personnalisées se mélangent librement. Ajoute un saut de ligne pour forcer les questions suivantes à démarrer une nouvelle ligne.</div>
          <button class="btn btn-g" style="margin-bottom:8px;" onclick="cfAddLineBreak()">+ Ajouter un saut de ligne</button>
          <div class="mod-list" id="cfQuestionOrderList"></div>
          <div class="mod-col-title" style="margin-top:16px;margin-bottom:8px;">ORDRE DES CASES À COCHER</div>
          <div class="mod-list" id="cfToggleOrderList"></div>
          <div class="mod-col-title" style="margin-top:16px;margin-bottom:8px;">ORDRE DES COLONNES — HISTORIQUE DES TRADES</div>
          <div class="mod-list" id="cfColOrderList"></div>
          <div class="mod-col-title" style="margin-top:16px;margin-bottom:8px;">ORDRE DES CASES KPI</div>
          <div class="mod-list" id="cfKpiOrderList"></div>
          <div class="mod-col-title" id="cfChartOrderTitle" style="margin-top:16px;margin-bottom:8px;">ORDRE DES GRAPHIQUES / WIDGETS</div>
          <div class="mod-list" id="cfChartOrderList"></div>
        </div>
      </div>
    </div>`;
  modGrid.parentNode.insertBefore(card, modGrid);
}
function cfToggleCard() {
  const body = document.getElementById('cfCardBody');
  const btn = document.getElementById('cfToggleBtn');
  if (!body || !btn) return;
  const opening = body.style.display === 'none';
  body.style.display = opening ? 'block' : 'none';
  btn.textContent = opening ? 'Masquer' : 'Afficher';
}
function cfToggleOrderSection() {
  const sec = document.getElementById('cfOrderSection');
  const btn = document.getElementById('cfOrderToggleBtn');
  if (!sec || !btn) return;
  const opening = sec.style.display === 'none';
  sec.style.display = opening ? 'block' : 'none';
  btn.textContent = opening
    ? "▲ Replier l'ordre"
    : '▾ Ordre (questionnaire / cases à cocher / colonnes / KPI / graphiques)';
}
function cfRenderSettings() {
  cfEnsureCard();
  cfEnsureNavToggleCard();
  cfEnsureOrders();
  const listEl = document.getElementById('cfFieldsList');
  const noneEl = document.getElementById('cfNoFields');
  if (!listEl || !noneEl) return;
  if (!APP.cfFields.length) {
    listEl.innerHTML = '';
    noneEl.style.display = 'block';
  } else {
    noneEl.style.display = 'none';
    listEl.innerHTML = APP.cfFields
      .map(f => {
        const typeLbl = (CF_TYPE_META[f.type] || {}).label || f.type;
        const widgetLbl =
          f.widget && f.widget.kind && f.widget.kind !== 'none'
            ? CF_WIDGET_META[f.widget.kind].label
            : null;
        return `<div class="mod-item" style="align-items:flex-start;flex-direction:column;gap:6px;padding:9px 11px;">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;">
          <div>
            <div style="font-size:12px;font-weight:600;">${escapeHtml(f.label)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">${escapeHtml(typeLbl)}${widgetLbl ? ' · ' + escapeHtml(widgetLbl) : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-g" style="padding:5px 9px;font-size:9px;" onclick="cfOpenBuilder('${f.id}')">Modifier</button>
            <button class="btn" style="padding:5px 9px;font-size:9px;background:var(--btn-delall-bg);color:var(--btn-delall-tx);border:1px solid var(--btn-delall-bd);border-radius:5px;cursor:pointer;" onclick="cfDeleteField('${f.id}')">Supprimer</button>
          </div>
        </div>
        ${f.type === 'select' ? `<div style="font-size:10px;color:var(--muted);width:100%;">Options modifiables dans "Listes personnalisables", plus bas.</div>` : ''}
      </div>`;
      })
      .join('');
  }
  const questionLabelMap = {};
  CF_BUILTIN_FORM_ANCHORS.forEach(a => (questionLabelMap[a.id] = a.label));
  APP.cfFields.forEach(f => (questionLabelMap[f.id] = f.colName || f.label));
  cfRenderQuestionOrderList('cfQuestionOrderList', APP.cfQuestionOrder, questionLabelMap, newOrder => {
    APP.cfQuestionOrder = newOrder;
    cfPersist();
    cfInjectFormFields('f');
    cfInjectFormFields('e');
  });

  const toggleLabelMap = {backtest: 'Backtest'};
  APP.cfFields.filter(f => f.type === 'toggle').forEach(f => (toggleLabelMap[f.id] = f.label));
  cfRenderOrderList('cfToggleOrderList', APP.cfToggleOrder, toggleLabelMap, newOrder => {
    APP.cfToggleOrder = newOrder;
    cfPersist();
    cfInjectToggleFields('f');
    cfInjectToggleFields('e');
  });

  const colLabelMap = {};
  CF_BUILTIN_COLS.forEach(c => (colLabelMap[c.id] = c.label));
  APP.cfFields.forEach(f => (colLabelMap[f.id] = f.colName || f.label));
  cfRenderOrderList('cfColOrderList', APP.cfColOrder, colLabelMap, newOrder => {
    APP.cfColOrder = newOrder;
    cfPersist();
    if (typeof renderTable === 'function') renderTable();
  });

  const kpiLabelMap = {};
  CF_BUILTIN_KPIS.forEach(k => (kpiLabelMap[k.id] = k.label));
  APP.cfFields.forEach(f => {
    if (f.widget && f.widget.kind === 'kpi') kpiLabelMap[f.id] = f.colName || f.label;
  });
  cfRenderOrderList('cfKpiOrderList', APP.cfKpiOrder, kpiLabelMap, newOrder => {
    APP.cfKpiOrder = newOrder;
    cfPersist();
    if (typeof updateKPIs === 'function') updateKPIs();
  });

  const chartLabelMap = {};
  CF_BUILTIN_CHARTS.forEach(c => (chartLabelMap[c.id] = c.label));
  APP.cfFields.forEach(f => {
    if (f.widget && CF_CHART_WIDGET_KINDS.includes(f.widget.kind))
      chartLabelMap[f.id] = f.colName || f.label;
  });
  const _cfCurMode = cfScreenMode();
  const _cfOrderTitle = document.getElementById('cfChartOrderTitle');
  if (_cfOrderTitle)
    _cfOrderTitle.textContent =
      'ORDRE DES GRAPHIQUES / WIDGETS — mode actuel : ' +
      (CF_MODE_LABELS[_cfCurMode] || _cfCurMode);
  cfRenderOrderList(
    'cfChartOrderList',
    APP.cfChartOrderByMode[_cfCurMode],
    chartLabelMap,
    newOrder => {
      APP.cfChartOrderByMode[_cfCurMode] = newOrder;
      cfPersist();
      if (typeof refreshAllCharts === 'function') refreshAllCharts();
    }
  );
}

// ── Modale de création / édition d'un champ ──
let cfEditingId = null;
let cfTempOptions = [];
function cfEnsureModal() {
  if (document.getElementById('cfModal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'cp-overlay';
  overlay.id = 'cfModal';
  overlay.innerHTML = `
    <div class="cp-modal" style="width:380px;">
      <div class="cp-title" id="cfmTitle">NOUVEAU CHAMP PERSONNALISÉ</div>
      <div class="fg" style="margin-bottom:9px;"><label>Question</label><input type="text" id="cfm-label" placeholder="Ex : Émotion pendant le trade"></div>
      <div class="fg" style="margin-bottom:9px;"><label>Format de réponse</label><select id="cfm-type" onchange="cfOnTypeChange()"></select></div>
      <div class="fg" id="cfm-options-wrap" style="margin-bottom:9px;display:none;">
        <label>Options du menu déroulant</label>
        <div class="mod-list" id="cfm-options-list" style="margin-bottom:6px;"></div>
        <div class="mod-add"><input type="text" id="cfm-options-add-input" placeholder="Ajouter une option..." onkeydown="if(event.key==='Enter'){event.preventDefault();cfAddOption();}"><button onclick="cfAddOption()">+</button></div>
      </div>
      <div class="fg" style="margin-bottom:9px;"><label id="cfm-afterq-label">Position dans le questionnaire</label><select id="cfm-afterq"></select></div>
      <div class="fg" style="margin-bottom:9px;"><label>Nom de la colonne (historique)</label><input type="text" id="cfm-colname" placeholder="Par défaut : même nom que la question"></div>
      <div class="fg" style="margin-bottom:9px;"><label>Position dans les colonnes</label><select id="cfm-aftercol"></select></div>
      <div class="fg" style="margin-bottom:9px;"><label>Widget Track Record</label><select id="cfm-widgetkind" onchange="cfOnWidgetKindChange()"></select></div>
      <div class="fg" id="cfm-widgetpos-row" style="margin-bottom:14px;">
        <label>Position du widget</label>
        <select id="cfm-widgetpos"></select>
        <div id="cfm-widgetpos-hint" style="font-size:9px;color:var(--muted);margin-top:4px;line-height:1.4;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <button class="btn" id="cfmDeleteBtn" style="background:var(--btn-delall-bg);color:var(--btn-delall-tx);border:1px solid var(--btn-delall-bd);display:none;" onclick="cfDeleteFieldFromModal()">Supprimer</button>
        <div style="display:flex;gap:8px;margin-left:auto;">
          <button class="btn btn-g" onclick="cfCloseBuilder()">Annuler</button>
          <button class="btn btn-p" onclick="cfSaveBuilder()">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('cfm-type').innerHTML = Object.keys(CF_TYPE_META)
    .map(k => `<option value="${k}">${CF_TYPE_META[k].label}</option>`)
    .join('');
}
function cfWidgetOptionsHtml(type) {
  const allowed = (CF_TYPE_META[type] || CF_TYPE_META.text).widgets;
  return allowed.map(k => `<option value="${k}">${CF_WIDGET_META[k].label}</option>`).join('');
}
// ── Menus de position du pop-up « Modifier le champ » ──
// Chaque menu (question, colonne, KPI / graphique) affiche l'ordre RÉEL — celui
// des listes d'ordre des Paramètres, glisser-déposer compris — avec les
// champs personnalisés intégrés À LEUR PLACE (repérés par « (perso) »). Ainsi
// un graphique personnalisé placé après « Win Rate » apparaît juste après
// « Win Rate » dans la liste. Avant, les menus listaient les éléments natifs
// dans un ordre fixe puis tous les champs personnalisés à la suite, dans
// l'ordre de création, sans rapport avec la position réelle.
// Le menu est pré-sélectionné sur la position ACTUELLE du champ (l'élément
// qui le précède), et le champ n'est déplacé à l'enregistrement que si tu
// changes ce choix (voir cfPosOrig / cfSaveBuilder).
let cfPosOrig = {};
function cfFieldById(id) {
  return APP.cfFields.find(x => x.id === id) || null;
}
function cfWidgetFamily(kind) {
  if (kind === 'kpi') return 'kpi';
  return CF_CHART_WIDGET_KINDS.includes(kind) ? 'chart' : null;
}
// Ordre réel + libellé de chaque élément, pour un type de liste. Les libellés
// sont les mêmes que dans les listes d'ordre des Paramètres.
function cfPosSource(kind) {
  cfEnsureOrders();
  if (kind === 'question') {
    return {
      order: APP.cfQuestionOrder,
      label: id => {
        if (cfIsLineBreak(id)) return '— Saut de ligne —';
        const bi = CF_BUILTIN_FORM_ANCHORS.find(x => x.id === id);
        if (bi) return bi.label;
        const x = cfFieldById(id);
        return x ? x.colName || x.label : null;
      }
    };
  }
  if (kind === 'toggle') {
    return {
      order: APP.cfToggleOrder,
      label: id => {
        if (id === 'backtest') return 'Backtest';
        const x = cfFieldById(id);
        return x ? x.label : null;
      }
    };
  }
  const builtin = {col: CF_BUILTIN_COLS, kpi: CF_BUILTIN_KPIS, chart: CF_BUILTIN_CHARTS}[kind];
  const order =
    kind === 'col'
      ? APP.cfColOrder
      : kind === 'kpi'
        ? APP.cfKpiOrder
        : APP.cfChartOrderByMode[cfScreenMode()] || builtin.map(x => x.id);
  return {
    order,
    label: id => {
      const bi = builtin.find(x => x.id === id);
      if (bi) return bi.label;
      const x = cfFieldById(id);
      return x ? x.colName || x.label : null;
    }
  };
}
// Remplit un menu de position. `keepPrev` : garde le choix en cours s'il est
// encore valable (changement de format / de widget pendant que le pop-up est
// ouvert) ; sinon (ouverture du pop-up) pré-sélectionne la position actuelle
// du champ, ou « à la fin » pour un nouveau champ.
function cfPosFill(selectId, kind, f, keepPrev) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  const src = cfPosSource(kind);
  const prev = keepPrev ? sel.value : null;
  const ids = [];
  const opts = ['<option value="__start__">— Au début —</option>'];
  src.order.forEach(id => {
    if (f && id === f.id) return; // on ne se positionne pas par rapport à soi-même
    const label = src.label(id);
    if (label == null) return;
    ids.push(id);
    opts.push(
      `<option value="${escapeHtml(id)}">Après : ${escapeHtml(label)}${cfFieldById(id) ? ' (perso)' : ''}</option>`
    );
  });
  sel.innerHTML = opts.join('');
  let val;
  if (prev && (prev === '__start__' || ids.includes(prev))) {
    val = prev;
  } else {
    const idx = f ? src.order.indexOf(f.id) : -1;
    if (idx === -1) {
      val = ids.length ? ids[ids.length - 1] : '__start__'; // nouveau champ : à la fin
    } else {
      val = '__start__';
      for (let i = idx - 1; i >= 0; i--) {
        if (ids.includes(src.order[i])) {
          val = src.order[i];
          break;
        }
      }
    }
  }
  sel.value = val;
  return val;
}
function cfPopulateAnchorSelects(f, fresh) {
  const isToggle = document.getElementById('cfm-type').value === 'toggle';
  const lbl = document.getElementById('cfm-afterq-label');
  if (lbl)
    lbl.textContent = isToggle ? 'Position parmi les cases à cocher' : 'Position dans le questionnaire';
  cfPosFill('cfm-afterq', isToggle ? 'toggle' : 'question', f, !fresh);
  cfPosFill('cfm-aftercol', 'col', f, !fresh);
}
function cfPopulateWidgetPosSelect(f, fresh) {
  const kind = document.getElementById('cfm-widgetkind').value;
  const fam = cfWidgetFamily(kind);
  const sel = document.getElementById('cfm-widgetpos');
  const hint = document.getElementById('cfm-widgetpos-hint');
  if (fam) cfPosFill('cfm-widgetpos', fam, f, !fresh);
  else sel.innerHTML = '';
  if (hint) {
    const mode = cfScreenMode();
    hint.textContent =
      fam === 'chart'
        ? 'Ordre affiché : mode « ' +
          (CF_MODE_LABELS[mode] || mode) +
          ' ». Dans les autres modes, le graphique se place après le même élément.'
        : '';
  }
}
// Positions affichées à l'ouverture : sert à ne déplacer le champ que si tu
// changes un de ces choix.
function cfCapturePosOrig() {
  const qSel = document.getElementById('cfm-afterq');
  cfPosOrig = {
    qKind: document.getElementById('cfm-type').value === 'toggle' ? 'toggle' : 'question',
    q: qSel ? qSel.value : '',
    col: document.getElementById('cfm-aftercol').value,
    wFam: cfWidgetFamily(document.getElementById('cfm-widgetkind').value),
    w: document.getElementById('cfm-widgetpos').value
  };
}
function cfOnTypeChange() {
  const type = document.getElementById('cfm-type').value;
  document.getElementById('cfm-options-wrap').style.display = type === 'select' ? '' : 'none';
  document.getElementById('cfm-widgetkind').innerHTML = cfWidgetOptionsHtml(type);
  const f = cfEditingId ? APP.cfFields.find(x => x.id === cfEditingId) : null;
  cfPopulateAnchorSelects(f);
  cfOnWidgetKindChange();
}
function cfOnWidgetKindChange() {
  const kind = document.getElementById('cfm-widgetkind').value;
  document.getElementById('cfm-widgetpos-row').style.display = kind === 'none' ? 'none' : '';
  const f = cfEditingId ? APP.cfFields.find(x => x.id === cfEditingId) : null;
  cfPopulateWidgetPosSelect(f);
}
function cfOpenBuilder(editId) {
  cfEnsureModal();
  cfEditingId = editId || null;
  const f = editId ? APP.cfFields.find(x => x.id === editId) : null;
  cfTempOptions = f ? (f.options || []).slice() : [];
  document.getElementById('cfmTitle').textContent = f
    ? 'MODIFIER LE CHAMP'
    : 'NOUVEAU CHAMP PERSONNALISÉ';
  document.getElementById('cfm-label').value = f ? f.label : '';
  document.getElementById('cfm-type').value = f ? f.type : 'text';
  document.getElementById('cfm-colname').value = f ? f.colName || '' : '';
  cfPopulateAnchorSelects(f, true);
  document.getElementById('cfm-options-wrap').style.display =
    (f ? f.type : 'text') === 'select' ? '' : 'none';
  document.getElementById('cfm-widgetkind').innerHTML = cfWidgetOptionsHtml(f ? f.type : 'text');
  document.getElementById('cfm-widgetkind').value =
    f && f.widget && f.widget.kind ? f.widget.kind : 'none';
  document.getElementById('cfm-widgetpos-row').style.display =
    document.getElementById('cfm-widgetkind').value === 'none' ? 'none' : '';
  cfPopulateWidgetPosSelect(f, true);
  cfCapturePosOrig();
  document.getElementById('cfmDeleteBtn').style.display = f ? '' : 'none';
  cfRenderOptionsEditor(document.getElementById('cfm-options-list'), cfTempOptions, () => {});
  document.getElementById('cfModal').classList.add('open');
}
function cfCloseBuilder() {
  const m = document.getElementById('cfModal');
  if (m) m.classList.remove('open');
}
function cfAddOption() {
  const inp = document.getElementById('cfm-options-add-input');
  const v = inp.value.trim();
  if (!v) return;
  cfTempOptions.push(v);
  inp.value = '';
  cfRenderOptionsEditor(document.getElementById('cfm-options-list'), cfTempOptions, () => {});
}
function cfSaveBuilder() {
  const label = document.getElementById('cfm-label').value.trim();
  if (!label) {
    alert('Le nom de la question est obligatoire.');
    return;
  }
  const type = document.getElementById('cfm-type').value;
  if (type === 'select' && cfTempOptions.length < 1) {
    alert('Ajoute au moins une option au menu déroulant.');
    return;
  }
  const colName = document.getElementById('cfm-colname').value.trim() || label;
  const afterCol = document.getElementById('cfm-aftercol').value;
  const widgetKind = document.getElementById('cfm-widgetkind').value;
  const widgetAfter = document.getElementById('cfm-widgetpos').value;
  const afterQ = document.getElementById('cfm-afterq').value;

  const isNew = !cfEditingId;
  let field = cfEditingId ? APP.cfFields.find(x => x.id === cfEditingId) : null;
  if (!field) {
    field = {id: cfNewId()};
    APP.cfFields.push(field);
  }
  field.label = label;
  field.type = type;
  field.options = type === 'select' ? cfTempOptions.slice() : undefined;
  field.colName = colName;
  field.afterCol = afterCol;
  field.widget = {kind: widgetKind};
  field.widgetAfter = widgetAfter;

  // Un champ existant n'est déplacé que si son menu de position a été changé
  // (ou si sa liste a changé : question ↔ case à cocher, KPI ↔ graphique...) :
  // enregistrer sans toucher aux positions ne le fait plus sauter ailleurs, et
  // ne touche pas à l'ordre des autres modes d'affichage.
  const o = cfPosOrig || {};
  const qKind = type === 'toggle' ? 'toggle' : 'question';
  const wFam = cfWidgetFamily(widgetKind);
  const moveQ = isNew || o.qKind !== qKind || o.q !== afterQ;
  const moveCol = isNew || o.col !== afterCol;
  const moveW = isNew || o.wFam !== wFam || o.w !== widgetAfter;

  cfEnsureOrders();
  if (moveQ) {
    cfInsertIntoOrder(qKind === 'toggle' ? APP.cfToggleOrder : APP.cfQuestionOrder, field.id, afterQ);
  }
  if (moveCol) cfInsertIntoOrder(APP.cfColOrder, field.id, afterCol);
  if (wFam === 'kpi') {
    if (moveW) cfInsertIntoOrder(APP.cfKpiOrder, field.id, widgetAfter);
    CF_SCREEN_MODES.forEach(m => {
      APP.cfChartOrderByMode[m] = APP.cfChartOrderByMode[m].filter(x => x !== field.id);
    });
  } else if (wFam === 'chart') {
    if (moveW) {
      CF_SCREEN_MODES.forEach(m => {
        cfInsertIntoOrder(APP.cfChartOrderByMode[m], field.id, widgetAfter);
      });
    }
    APP.cfKpiOrder = APP.cfKpiOrder.filter(x => x !== field.id);
  } else {
    APP.cfKpiOrder = APP.cfKpiOrder.filter(x => x !== field.id);
    CF_SCREEN_MODES.forEach(m => {
      APP.cfChartOrderByMode[m] = APP.cfChartOrderByMode[m].filter(x => x !== field.id);
    });
  }

  cfPersist();
  cfCloseBuilder();
  cfFullRerender();
}
function cfDeleteField(id) {
  showConfirm(
    'Supprimer ce champ ?',
    "Les réponses déjà enregistrées pour ce champ seront masquées (le reste des données du trade n'est pas touché).",
    () => {
      APP.cfFields = APP.cfFields.filter(x => x.id !== id);
      cfEnsureOrders();
      cfPersist();
      cfFullRerender();
    }
  );
}
function cfDeleteFieldFromModal() {
  const id = cfEditingId;
  if (!id) return;
  cfCloseBuilder();
  cfDeleteField(id);
}

// ── Rendu global ──
function cfFullRerender() {
  cfEnsureOrders();
  cfInjectFormFields('f');
  cfInjectFormFields('e');
  if (typeof renderTable === 'function') renderTable();
  if (typeof refreshAllCharts === 'function') refreshAllCharts();
  cfRenderSettings();
}

// ══════════════════════════════════════════════════════════════════════════
// SURCHARGES (wrapping) — n'édite aucune fonction existante, se contente de
// l'entourer pour y greffer le comportement des champs personnalisés.
// ══════════════════════════════════════════════════════════════════════════
const _cfOrigRenderTable = window.renderTable;
window.renderTable = function () {
  _cfOrigRenderTable();
  try {
    cfApplyColumnOrder();
  } catch (e) {
    console.warn('CF renderTable:', e);
  }
};

// Ajout / modification d'un trade : on complète le trade via les crochets de
// app-part1.js (TJP_TRADE_HOOKS), appelés AVANT la sauvegarde et le resetForm()
// de la fonction native — donc les champs du formulaire sont encore remplis, et
// une seule sauvegarde + un seul rendu ont lieu (avant : enveloppe autour de
// addTrade/saveEditTrade = 2e sauvegarde + rendu + envoi cloud par trade).
window.TJP_TRADE_HOOKS.add.push(function (t) {
  APP.cfFields.forEach(function (f) {
    t['cf_' + f.id] = cfReadInput('f', f);
  });
});
window.TJP_TRADE_HOOKS.edit.push(function (t) {
  APP.cfFields.forEach(function (f) {
    t['cf_' + f.id] = cfReadInput('e', f);
  });
});

const _cfOrigOpenEditTrade = window.openEditTrade;
window.openEditTrade = function (id) {
  _cfOrigOpenEditTrade(id);
  try {
    cfInjectFormFields('e');
    const t = APP.trades.find(x => x.id === parseInt(id, 10));
    if (t) {
      APP.cfFields.forEach(f => {
        cfSetInputValue('e', f, t['cf_' + f.id]);
      });
    }
  } catch (e) {
    console.warn('CF openEditTrade:', e);
  }
};

const _cfOrigResetForm = window.resetForm;
window.resetForm = function () {
  _cfOrigResetForm();
  try {
    document.querySelectorAll('.cf-input').forEach(el => {
      if (el.id.indexOf('f-cf-') === 0) {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
      }
    });
    APP.cfFields
      .filter(f => f.type === 'stars')
      .forEach(f => {
        if (typeof initStarPicker === 'function')
          initStarPicker('f-cf-' + f.id + '-picker', 'f-cf-' + f.id, 0);
      });
  } catch (e) {
    console.warn('CF resetForm:', e);
  }
};

const _cfOrigBuildTV = window.buildTV;
window.buildTV = function () {
  return _cfOrigBuildTV().concat(cfBuildThemeVars());
};

const _cfOrigUpdateKPIs = window.updateKPIs;
window.updateKPIs = function () {
  _cfOrigUpdateKPIs();
  try {
    cfRenderKpiWidgets();
    cfApplyKpiOrder();
    cfLayoutKpiStrip();
  } catch (e) {
    console.warn('CF KPI:', e);
  }
};

// Le camembert Win Rate natif doit avoir EXACTEMENT le même rayon (donc la
// même épaisseur d'anneau) et la même absence de légende que les
// camemberts custom (catégories identifiées par l'info-bulle au clic).
// Constat : masquer la légende après coup (CH.pie.options...+update())
// fonctionne, mais PAS agrandir le rayon de la même façon — Chart.js v4 ne
// recalcule pas la géométrie de l'anneau pour un simple update() suite à
// une mutation directe de `options.radius`. Le rayon doit donc être fixé
// EN AMONT, avant la toute première création du graphique : Chart.overrides
// (config par défaut par type de graphique, Chart.js v4) est fait pour ça —
// drawPie() ne précise pas de "radius" explicite, donc cette valeur par
// défaut s'applique dès sa première exécution, sans rien devoir corriger
// après coup.
if (window.Chart && Chart.overrides && Chart.overrides.doughnut) {
  Chart.overrides.doughnut.radius = CF_PIE_RADIUS;
  if (!Chart.overrides.doughnut.plugins) Chart.overrides.doughnut.plugins = {};
  if (!Chart.overrides.doughnut.plugins.legend) Chart.overrides.doughnut.plugins.legend = {};
  Chart.overrides.doughnut.plugins.legend.display = false;
}
// Filet de sécurité complémentaire (garde le rayon/l'absence de légende
// même si un futur appel de drawPie() précisait explicitement ses propres
// valeurs, qui primeraient alors sur le défaut ci-dessus) :
if (typeof window.drawPie === 'function') {
  const _cfOrigDrawPie = window.drawPie;
  window.drawPie = function (...args) {
    _cfOrigDrawPie.apply(this, args);
    try {
      // CH est déclaré avec `const CH = {}` dans app-part1.js : ça ne
      // l'attache PAS à window (contrairement à `var`/aux fonctions), mais
      // il reste accessible en référence directe (même portée globale
      // partagée entre les <script>).
      if (typeof CH !== 'undefined' && CH.pie) {
        if (!CH.pie.options.plugins) CH.pie.options.plugins = {};
        if (!CH.pie.options.plugins.legend) CH.pie.options.plugins.legend = {};
        CH.pie.options.plugins.legend.display = false;
        CH.pie.update('none');
      }
    } catch (e) {}
  };
}

const _cfOrigRefreshAllCharts = window.refreshAllCharts;
window.refreshAllCharts = function () {
  _cfOrigRefreshAllCharts();
  try {
    cfRenderCustomCharts();
    cfApplyChartOrder();
    cfApplyChartLayout();
    cfNormalizeChartHeights();
  } catch (e) {
    console.warn('CF charts:', e);
  }
};

// redrawForKey() est le point d'entrée générique utilisé par toggleBT() (case
// BT native) pour redessiner un graphique donné à partir de sa clé. On
// l'étend pour les clés de champs personnalisés (déjà préfixées "cf_"),
// sans toucher au chemin natif.
const _cfOrigRedrawForKey = window.redrawForKey;
window.redrawForKey = function (k) {
  if (typeof k === 'string' && k.indexOf('cf_') === 0) {
    const f = APP.cfFields.find(x => x.id === k);
    if (f && f.widget) {
      if (f.widget.kind === 'card') {
        const el = document.getElementById('cfstatval-' + f.id);
        if (el) el.textContent = cfKpiValueText(f);
      } else if (CF_CHART_WIDGET_KINDS.includes(f.widget.kind)) {
        cfDrawChart(f);
      }
    }
    return;
  }
  _cfOrigRedrawForKey(k);
};

// _doSwitchAccount() (natif) ne rechargeait jamais APP.cfFields/cfColOrder/
// cfKpiOrder/cfChartOrder pour le compte nouvellement actif : cfLoad() n'était
// appelé qu'une seule fois, tout au début, au chargement du script. Résultat :
// en changeant de compte de trading local, les colonnes/KPI/graphiques
// personnalisés affichés restaient ceux du compte actif au chargement de la
// page, même si le bon tj_cf_config__<accId> était correctement lu/écrit en
// stockage. On recharge donc explicitement la config du compte ici, puis on
// redessine (les fonctions renderTable/updateKPIs/refreshAllCharts ci-dessus
// ont déjà tourné une première fois dans l'original avec l'ancienne config —
// ce deuxième passage corrige l'affichage immédiatement après).
if (typeof window._doSwitchAccount === 'function') {
  const _cfOrigDoSwitchAccount = window._doSwitchAccount;
  window._doSwitchAccount = function (accId) {
    _cfOrigDoSwitchAccount(accId);
    try {
      cfLoad();
      cfEnsureOrders();
      renderTable();
      updateKPIs();
      refreshAllCharts();
    } catch (e) {
      console.warn('CF switchAccount:', e);
    }
  };
}

// Boutons de période (J/SEM/MOIS/TRIM/AN/TOUT) des graphiques personnalisés :
// délégation d'événement plutôt que bindPBtns() natif, pour ne jamais
// re-attacher de listener sur les boutons natifs (qui gèrent déjà les leurs).
document.addEventListener('click', function (e) {
  const btn = e.target.closest && e.target.closest('.pbtn[data-chart]');
  if (!btn) return;
  const c = btn.dataset.chart,
    p = btn.dataset.p;
  if (!c || c.indexOf('cf_') !== 0) return;
  ST[c] = p;
  const grp = btn.closest('.period-btns');
  if (grp) grp.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  redrawForKey(c);
});

const _cfOrigRenderModifs = window.renderModifs;
window.renderModifs = function () {
  _cfOrigRenderModifs();
  try {
    cfRenderCustomDropdownLists();
    cfRenderSettings();
  } catch (e) {
    console.warn('CF settings:', e);
  }
};

if (typeof window.buildSyncPayload === 'function') {
  const _cfOrigBuildSyncPayload = window.buildSyncPayload;
  window.buildSyncPayload = function (trades) {
    const payload = _cfOrigBuildSyncPayload(trades);
    try {
      payload.cf_config = JSON.stringify(cfConfigSnapshot());
    } catch (e) {
      console.warn('CF sync payload:', e);
    }
    return payload;
  };
}
if (typeof window._applyCloudDataDirect === 'function') {
  const _cfOrigApplyCloudDataDirect = window._applyCloudDataDirect;
  window._applyCloudDataDirect = function (data, cloudTrades) {
    // La fonction d'origine recharge elle-même la config locale (cfLoad) : on garde
    // de côté l'ordre local pour le rendre si la config reçue n'en contient pas
    // (envoyée par un autre appareil qui n'a pas encore la mise à jour).
    const prevQuestionOrder = APP.cfQuestionOrder;
    const prevToggleOrder = APP.cfToggleOrder;
    _cfOrigApplyCloudDataDirect(data, cloudTrades);
    try {
      if (data && data.cf_config) {
        const cfg = JSON.parse(data.cf_config);
        APP.cfFields = Array.isArray(cfg.fields) ? cfg.fields : [];
        APP.cfColOrder = Array.isArray(cfg.colOrder) ? cfg.colOrder : null;
        APP.cfKpiOrder = Array.isArray(cfg.kpiOrder) ? cfg.kpiOrder : null;
        APP.cfQuestionOrder = Array.isArray(cfg.questionOrder) ? cfg.questionOrder : prevQuestionOrder;
        APP.cfToggleOrder = Array.isArray(cfg.toggleOrder) ? cfg.toggleOrder : prevToggleOrder;
        APP.cfChartOrderByMode = cfNormalizeChartOrderByMode(cfg);
        APP.cfNavColumnByMode =
          cfg.navColumnByMode && typeof cfg.navColumnByMode === 'object'
            ? cfg.navColumnByMode
            : {};
        APP.cfChartLinksByMode =
          cfg.chartLinksByMode && typeof cfg.chartLinksByMode === 'object'
            ? cfg.chartLinksByMode
            : {};
        APP.cfPencilStyles =
          cfg.pencilStyles && typeof cfg.pencilStyles === 'object' ? cfg.pencilStyles : {};
        cfEnsureOrders();
        lssAcc('tj_cf_config', cfConfigSnapshot());
        cfInjectFormFields('f');
        cfInjectFormFields('e');
        renderTable();
        refreshAllCharts();
        cfLayoutKpiStrip();
        cfApplyNavStyle();
        cfRenderSettings();
        cfApplyPencilStylesCss();
      }
    } catch (e) {
      console.warn('CF cloud pull:', e);
    }
  };
}

// ── Amorçage ──
// Quadrillage de l'historique des trades (lignes ET colonnes), couleur
// pilotée par --history-grid-color (thème > Journal de trading). Valeur par
// défaut = la ligne de séparation d'origine, pour ne rien changer tant que
// l'utilisateur n'a pas choisi sa propre couleur.
function cfEnsureHistoryGridStyle() {
  if (document.getElementById('cfHistoryGridStyle')) return;
  const style = document.createElement('style');
  style.id = 'cfHistoryGridStyle';
  style.textContent = `
#page-journal table{border-collapse:collapse;}
#page-journal table th,#page-journal table td{border:1px solid var(--history-grid-color,rgba(30,45,69,.5));}
`;
  document.head.appendChild(style);
}

// Historique des trades > œil (voir images) : cliquer à côté des images
// (sur le fond sombre) ferme directement la fenêtre, plus besoin de
// descendre jusqu'au bouton FERMER en bas.
function cfEnsureImgViewClickOutside() {
  const modal = document.getElementById('imgViewModal');
  if (!modal || modal.dataset.cfClickOutside) return;
  modal.dataset.cfClickOutside = '1';
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.classList.remove('open');
  });
}

// ── Menu de navigation en colonne, forçable sur PC ──
// Réglage PAR MODE (téléphone / vertical / normal / ultrawide), synchronisé
// cloud comme le reste de cf_config : c'est le MODE qui porte le réglage
// (pas l'appareil), donc si deux appareils différents se retrouvent un jour
// dans le même mode, ils se comportent pareil — logique, puisque tout le
// reste (graphiques, KPI) fonctionne déjà par mode de la même façon.
function cfNavForceColumn() {
  return !!(APP.cfNavColumnByMode && APP.cfNavColumnByMode[cfScreenMode()]);
}
function cfEnsureNavStyle() {
  if (document.getElementById('cfNavStyle')) return;
  const style = document.createElement('style');
  style.id = 'cfNavStyle';
  style.textContent = `
body.cf-nav-force-column .nav-desktop{display:none!important;}
body.cf-nav-force-column .nav-mobile{display:block!important;}
body.cf-nav-force-column .hamburger{display:flex!important;}
/* PC normal / ultra wide : on fusionne les 2 lignes du menu téléphone en une
   seule (badges tout à droite) — la 2e ligne séparée n'a de sens que sur un
   écran étroit (téléphone / PC vertical), pas ici. */
body.cf-nav-force-column.cf-mode-normal .nav-mobile,
body.cf-nav-force-column.cf-mode-ultrawide .nav-mobile{display:flex!important;flex-direction:row;align-items:center;}
body.cf-nav-force-column.cf-mode-normal .nav-mobile-row1,
body.cf-nav-force-column.cf-mode-ultrawide .nav-mobile-row1{flex:1 1 auto;min-width:0;}
body.cf-nav-force-column.cf-mode-normal .nav-mobile-row2,
body.cf-nav-force-column.cf-mode-ultrawide .nav-mobile-row2{flex:0 0 auto;border-top:none;padding:0 16px 0 0;}
/* Ultra wide uniquement : les horloges sont centrées sur la largeur de TOUT l'écran
   (et non au milieu de l'espace restant entre le logo et les cases de droite). */
body.cf-nav-force-column.cf-mode-ultrawide .nav-mobile{position:relative;}
body.cf-nav-force-column.cf-mode-ultrawide .nav-mobile-clocks{position:absolute;left:50%;top:0;bottom:0;transform:translateX(-50%);flex:none;margin:0;}
`;
  document.head.appendChild(style);
}
function cfApplyNavStyle() {
  cfEnsureNavStyle();
  const mode = cfScreenMode();
  document.body.classList.remove(
    'cf-mode-phone',
    'cf-mode-vertical',
    'cf-mode-normal',
    'cf-mode-ultrawide'
  );
  document.body.classList.add('cf-mode-' + mode);
  document.body.classList.toggle('cf-nav-force-column', cfNavForceColumn());
}
// Recalcule tout ce qui dépend du mode d'affichage (largeur d'écran OU mode
// forcé manuellement) : KPI, ordre + largeur des graphiques, style de nav,
// et les Paramètres si la page est ouverte (sélecteur de mode / toggle /
// liste d'ordre des graphiques doivent refléter le mode qu'on vient
// d'activer).
function cfRecomputeLayout() {
  try {
    cfLayoutKpiStrip();
    cfApplyChartOrder();
    cfApplyChartLayout();
    cfNormalizeChartHeights();
    cfApplyNavStyle();
    cfRenderSettings();
  } catch (e) {}
}
function cfRefreshPrefsCard() {
  const sel = document.getElementById('cfModeOverrideSel');
  if (sel) sel.value = cfModeOverride();
  const modeLbl = document.getElementById('cfNavModeLbl');
  if (modeLbl) modeLbl.textContent = CF_MODE_LABELS[cfScreenMode()] || cfScreenMode();
  // Le toggle "Menu de navigation en colonne (PC)" n'a d'effet qu'en mode
  // PC normal/ultra wide : en téléphone et PC vertical, le menu mobile
  // s'affiche déjà nativement quel que soit son état, donc le masquer pour
  // ne pas laisser un réglage sans effet visible (16/09/2026).
  const row = document.getElementById('cfNavColumnRow');
  if (row) {
    const mode = cfScreenMode();
    row.style.display = mode === 'phone' || mode === 'vertical' ? 'none' : '';
  }
  const tgl = document.getElementById('cfTglNavColumn');
  const lbl = document.getElementById('cfNavColumnLbl');
  if (tgl && lbl) {
    const on = cfNavForceColumn();
    tgl.classList.toggle('on', on);
    lbl.textContent = on ? 'Activé' : 'Désactivé';
  }
}
function cfToggleNavColumn() {
  cfEnsureOrders();
  const mode = cfScreenMode();
  APP.cfNavColumnByMode[mode] = !APP.cfNavColumnByMode[mode];
  cfPersist();
  cfRefreshPrefsCard();
  cfApplyNavStyle();
}
// Carte "PRÉFÉRENCES", placée entre "CAPITAL & RISK" et "RISK MANAGEMENT —
// RÉGLAGES" (repérées via leur data-tvar, stable même si le titre affiché
// est renommé) — pour l'instant : mode d'affichage forcé + toggle nav. Ne
// touche pas à la carte "Champs personnalisés" (cfEnsureCard), gérée à part.
function cfEnsureNavToggleCard() {
  if (document.getElementById('cfNavCard')) {
    cfRefreshPrefsCard();
    return;
  }
  const anchorTitle = document.querySelector('[data-tvar="--crt-riskreglages"]');
  const anchorCard = anchorTitle && anchorTitle.closest('.card');
  const modGrid = document.getElementById('modGrid');
  const insertBeforeEl = anchorCard || modGrid;
  if (!insertBeforeEl) return;
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'cfNavCard';
  card.innerHTML = `
    <div class="card-header"><div class="card-title" data-editable>PRÉFÉRENCES</div></div>
    <div class="card-body">
      <div class="fg" style="max-width:240px;margin-bottom:14px;">
        <label data-editable>Mode d'affichage</label>
        <select id="cfModeOverrideSel" onchange="cfSetModeOverride(this.value)">
          <option value="auto">Auto (détection automatique)</option>
          <option value="phone">Téléphone</option>
          <option value="vertical">PC vertical</option>
          <option value="normal">PC normal</option>
          <option value="ultrawide">Ultra wide</option>
        </select>
      </div>
      <div style="font-size:10px;color:var(--muted);margin:-6px 0 10px;">Réglage propre au mode actif : <b id="cfNavModeLbl">—</b></div>
      <div class="tgl-row" id="cfNavColumnRow">
        <span data-editable>Menu de navigation en colonne (PC) :</span>
        <div class="tgl-track" id="cfTglNavColumn" onclick="cfToggleNavColumn()"><div class="tgl-thumb"></div></div>
        <span id="cfNavColumnLbl" style="color:var(--muted)">Désactivé</span>
      </div>
    </div>`;
  insertBeforeEl.parentNode.insertBefore(card, insertBeforeEl);
  cfRefreshPrefsCard();
}

// ── Mode stylo : police + taille indépendante PC/téléphone pour le libellé
// des questions personnalisées (les autres éléments éditables de l'appli ne
// sont pas concernés — le comportement natif, volontairement identique sur
// PC et téléphone, reste inchangé partout ailleurs). ──
const CF_PENCIL_FONTS = ['Space Mono', 'DM Sans', 'Arial', 'Georgia', 'Courier New'];
function cfEnsurePencilExtraControls() {
  if (document.getElementById('cfPencilExtra')) return;
  const toolbar = document.getElementById('pencilToolbar');
  if (!toolbar) return;
  const wrap = document.createElement('span');
  wrap.id = 'cfPencilExtra';
  wrap.style.cssText = 'display:none;align-items:center;gap:8px;';
  wrap.innerHTML = `
    <label style="font-family:var(--mono);font-size:9px;color:var(--muted)">Police :</label>
    <select id="cfPencilFontFamily" onchange="cfApplyPencilExtra()">${CF_PENCIL_FONTS.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}</select>
    <label style="font-family:var(--mono);font-size:9px;color:var(--muted)">Taille PC :</label>
    <input type="number" id="cfPencilFontSizePC" min="8" max="72" style="width:52px;" oninput="cfApplyPencilExtra()">
    <label style="font-family:var(--mono);font-size:9px;color:var(--muted)">Taille tél. :</label>
    <input type="number" id="cfPencilFontSizeMobile" min="8" max="72" style="width:52px;" oninput="cfApplyPencilExtra()">
  `;
  const checkBtn = toolbar.querySelector('button.btn-g');
  if (checkBtn) toolbar.insertBefore(wrap, checkBtn);
  else toolbar.appendChild(wrap);
}
// Applique en direct (à chaque changement des contrôles ci-dessus), pour un
// retour immédiat pendant que l'utilisateur ajuste — la sauvegarde définitive
// se fait quand même via le bouton natif "✓" (applyPencilStyle, surchargé
// plus bas), qui nettoie aussi la taille "générique" que le mécanisme natif
// aurait posée en trop.
function cfApplyPencilExtra() {
  if (!currentEditEl || currentEditEl.dataset.cfCustomLabel !== '1') return;
  const fieldId = currentEditEl.dataset.cfFieldId;
  const fontFamily = document.getElementById('cfPencilFontFamily').value;
  const fsDesktop = parseInt(document.getElementById('cfPencilFontSizePC').value, 10) || 14;
  const fsMobile = parseInt(document.getElementById('cfPencilFontSizeMobile').value, 10) || 14;
  if (!APP.cfPencilStyles) APP.cfPencilStyles = {};
  APP.cfPencilStyles[fieldId] = {fontFamily, fsDesktop, fsMobile};
  cfApplyPencilStylesCss();
}
// Régénère la feuille de style regroupant toutes les polices/tailles
// personnalisées, avec des règles PC et téléphone séparées (impossible à
// obtenir avec un simple style inline, qui ne connaît pas les media queries).
function cfApplyPencilStylesCss() {
  let style = document.getElementById('cfPencilStylesCss');
  if (!style) {
    style = document.createElement('style');
    style.id = 'cfPencilStylesCss';
    document.head.appendChild(style);
  }
  const styles = APP.cfPencilStyles || {};
  let css = '';
  Object.keys(styles).forEach(fieldId => {
    const st = styles[fieldId];
    const sel = '#cflabelf-' + fieldId + ',#cflabele-' + fieldId;
    if (st.fontFamily)
      css += sel + "{font-family:'" + st.fontFamily + "',sans-serif !important;}\n";
    css +=
      '@media(min-width:1101px){' +
      sel +
      '{font-size:' +
      (st.fsDesktop || 14) +
      'px !important;}}\n';
    css +=
      '@media(max-width:1100px){' +
      sel +
      '{font-size:' +
      (st.fsMobile || 14) +
      'px !important;}}\n';
  });
  style.textContent = css;
}
const _cfOrigPencilSyncPanelToEl = window.pencilSyncPanelToEl;
window.pencilSyncPanelToEl = function (el) {
  _cfOrigPencilSyncPanelToEl(el);
  try {
    cfEnsurePencilExtraControls();
    const extra = document.getElementById('cfPencilExtra');
    const nativeFsInput = document.getElementById('pencilFontSize');
    const isCustomLabel = !!(el && el.dataset && el.dataset.cfCustomLabel === '1');
    if (extra) extra.style.display = isCustomLabel ? 'inline-flex' : 'none';
    if (nativeFsInput) {
      nativeFsInput.style.display = isCustomLabel ? 'none' : '';
      if (nativeFsInput.previousElementSibling)
        nativeFsInput.previousElementSibling.style.display = isCustomLabel ? 'none' : '';
    }
    if (isCustomLabel) {
      const fieldId = el.dataset.cfFieldId;
      const st = (APP.cfPencilStyles && APP.cfPencilStyles[fieldId]) || {};
      document.getElementById('cfPencilFontFamily').value = st.fontFamily || CF_PENCIL_FONTS[0];
      document.getElementById('cfPencilFontSizePC').value = st.fsDesktop || 14;
      document.getElementById('cfPencilFontSizeMobile').value = st.fsMobile || 14;
    }
  } catch (e) {
    console.warn('CF pencil sync:', e);
  }
};
const _cfOrigApplyPencilStyle = window.applyPencilStyle;
window.applyPencilStyle = function () {
  _cfOrigApplyPencilStyle();
  try {
    if (currentEditEl && currentEditEl.dataset && currentEditEl.dataset.cfCustomLabel === '1') {
      // L'appel natif ci-dessus vient de poser une taille de police unique
      // (identique PC/téléphone) directement en style inline — on la retire
      // pour laisser nos règles CSS séparées (voir cfApplyPencilStylesCss)
      // faire foi, sans quoi le style inline serait toujours prioritaire.
      currentEditEl.style.removeProperty('font-size');
      delete currentEditEl.dataset.userFs;
      // Idem pour la valeur déjà enregistrée par saveOneEdit() juste avant :
      // sans ce nettoyage, applyPencilEdits() la réappliquerait sans
      // distinction PC/téléphone au prochain chargement de page.
      const key = getEK(currentEditEl);
      const editsKey = accKey('tj_pencil_edits');
      const edits = ls(editsKey, {});
      if (edits[key]) {
        edits[key].fs = '';
        lss(editsKey, edits);
      }
      cfApplyPencilExtra();
      cfPersist();
    }
  } catch (e) {
    console.warn('CF pencil style:', e);
  }
};

function cfInit() {
  try {
    cfLoad();
    cfEnsureOrders();
    cfEnsureModal();
    cfEnsureCard();
    cfEnsureHistoryGridStyle();
    cfEnsureImgViewClickOutside();
    cfApplyNavStyle();
    cfApplyPencilStylesCss();
    cfInjectFormFields('f');
    cfInjectFormFields('e');
    cfEnsureChartsContainer();
    cfRenderKpiWidgets();
    cfApplyKpiOrder();
    cfLayoutKpiStrip();
    cfRenderCustomCharts();
    cfApplyChartOrder();
    cfApplyChartLayout();
    cfNormalizeChartHeights();
    if (typeof renderTable === 'function') renderTable();
    cfRenderSettings();
  } catch (e) {
    console.error("Erreur d'initialisation des champs personnalisés :", e);
  }
}
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(cfInit, 120);
});
// Recalcule les mises en page dépendantes du nombre de cases (KPI) et de la
// largeur d'écran (graphiques, nav) au franchissement d'un des 3 seuils
// utilisés par cfScreenMode() (téléphone / portrait / ultra wide). Sans
// effet si un mode est forcé manuellement (le mode ne peut alors plus
// changer via ces seuils), mais inoffensif de les garder branchés.
if (window.matchMedia) {
  [
    window.matchMedia('(max-width:700px)'),
    window.matchMedia('(orientation:portrait)'),
    window.matchMedia('(min-aspect-ratio:2/1)')
  ].forEach(mq => {
    if (mq.addEventListener) mq.addEventListener('change', cfRecomputeLayout);
    else if (mq.addListener) mq.addListener(cfRecomputeLayout);
  });
}


// RR Pris : reste toujours collé juste après RR Cible dans le formulaire
// (nouveau trade + édition), quel que soit l'ordre des questions.
(function () {
  function place(prefix) {
    var g = document.getElementById(prefix + '-rrpris-group');
    var c = document.getElementById(prefix + '-rrcible');
    var cg = c && c.closest('.fg');
    if (g && cg && cg.parentNode && cg.nextElementSibling !== g) cg.parentNode.insertBefore(g, cg.nextSibling);
  }
  function all() { place('f'); place('e'); }
  if (typeof window.cfInjectFormFields === 'function') {
    var orig = window.cfInjectFormFields;
    window.cfInjectFormFields = function (prefix) {
      var r = orig.apply(this, arguments);
      try { all(); } catch (e) {}
      return r;
    };
  }
  if (typeof window.toggleFormRrAuto === 'function') {
    var t = window.toggleFormRrAuto;
    window.toggleFormRrAuto = function () {
      var r = t.apply(this, arguments);
      try { all(); } catch (e) {}
      return r;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
  else all();
})();
