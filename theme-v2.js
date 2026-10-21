// ═══════════════════════════════════════════════════════════════════════
// THÈME V2 — NOUVELLES COULEURS DE BASE — TJP · module additif, zéro-édition
// ═══════════════════════════════════════════════════════════════════════
// Remplace TOUTES les couleurs de base du thème (fond, cartes, textes, boutons,
// graphiques, calendrier, Ami, Analyse IA, connexion...) par une palette
// cohérente (octobre 2026, demande de Paul) :
//   • un seul accent « chrome » : indigo clair #8b9bff (titres de page, onglet
//     actif, boutons principaux, filtres, courbe du capital) ;
//   • gain = émeraude #34d399, perte = corail #fb7185 (uniquement pour ce qui
//     est un résultat : P&L, tags LONG/SHORT, calendrier, comparaisons...) ;
//   • risque = ambre #f6bd4f, infos = bleu ciel #56b9f2 ;
//   • neutres bleu-nuit légèrement teintés (fond, cartes, bordures, textes) ;
//   • titres de cartes / graphiques : gris-lavande discret #aeb6d0.
//
// QUI EST CONCERNÉ — seulement les couleurs qui n'ont jamais été personnalisées :
//   • nouveau compte → thème vide → il reçoit directement la nouvelle palette ;
//   • compte qui n'a jamais touché au thème → idem ;
//   • compte dont le thème a été enregistré : l'éditeur de thème « gèle » TOUTES
//     les couleurs dans le thème dès qu'on en change une seule. On compare donc
//     chaque couleur enregistrée à l'ANCIENNE valeur de base : si elle est
//     identique, c'est que Paul n'y a jamais touché → elle est retirée du thème
//     enregistré et la nouvelle valeur de base s'applique. Toute couleur
//     différente de l'ancienne valeur de base (choisie à la main) est conservée
//     telle quelle. Cette opération se refait à chaque chargement de thème
//     (connexion, changement de compte, synchro cloud) et est sans danger si
//     elle tourne plusieurs fois.
//
// Les nouvelles valeurs sont posées par une règle « html:root » (plus
// prioritaire que le :root de style.css, quel que soit l'ordre de chargement),
// et par les tableaux de défauts existants (TITLE_DEFAULTS, IA_BAR_DEFAULTS,
// FC_THEME_DEFAULTS, MGMT_PALETTE) mis à jour sur place.
//
// N'édite aucun fichier existant : une seule ligne ajoutée à la fin d'index.html.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── 1. Nouvelles valeurs de base (variable → valeur) ─────────────────
  var NEW = {
  '--acc-add-btn-color': '#8b9bff',
  '--acc-add-btn-hover-background': '#8b9bff',
  '--acc-item-active-acc-background': '#8b9bff',
  '--acc-item-avatar-background': '#232838',
  '--acc-item-avatar-color': '#8189a1',
  '--acc-item-borderbott': '#232838',
  '--acc-item-dots-color': '#8189a1',
  '--acc-item-dots-hover-background': '#232838',
  '--acc-item-dots-hover-color': '#e7e9f1',
  '--acc-menu-bd': '#232838',
  '--acc-menu-bg': '#11141d',
  '--acc-menu-tx': '#e7e9f1',
  '--acc-menu-tx2': '#8189a1',
  '--acc-opt-btn-danger-hover-background': '#fb7185',
  '--alert-color': '#34d399',
  '--auth-bg': '#0b0d14',
  '--auth-btn-bg': '#5361e0',
  '--auth-input-bd': '#232838',
  '--auth-input-bg': '#11141d',
  '--auth-sub': '#8189a1',
  '--auth-title': '#8b9bff',
  '--badge-p-bd': 'rgba(86,185,242,0.3)',
  '--badge-p-bg': 'rgba(86,185,242,0.1)',
  '--badge-p-neg-tx': '#fb7185',
  '--badge-p-pos-tx': '#34d399',
  '--badge-r-bd': 'rgba(246,189,79,0.3)',
  '--badge-r-bg': 'rgba(246,189,79,0.1)',
  '--badge-r-tx': '#f6bd4f',
  '--badge-t-bd': 'rgba(139,155,255,0.3)',
  '--badge-t-bg': 'rgba(139,155,255,0.1)',
  '--badge-t-tx': '#8b9bff',
  '--bg': '#0b0d14',
  '--border': '#232838',
  '--bt-bg': '#f6bd4f',
  '--bt-toggle-color': '#8189a1',
  '--btn-bkdir-bd': '#8189a1',
  '--btn-bkdir-tx': '#8189a1',
  '--btn-bkdirclear-bd': '#8189a1',
  '--btn-bkdirclear-tx': '#8189a1',
  '--btn-d-bd': 'rgba(251,113,133,0.3)',
  '--btn-d-bg': 'rgba(251,113,133,0.15)',
  '--btn-d-tx': '#fb7185',
  '--btn-deco-bd': '#fb7185',
  '--btn-deco-tx': '#fb7185',
  '--btn-delall-bd': '#fb7185',
  '--btn-delall-tx': '#fb7185',
  '--btn-export-bd': '#8b9bff',
  '--btn-export-tx': '#8b9bff',
  '--btn-g-bd': '#232838',
  '--btn-g-bg': '#1a1f31',
  '--btn-g-hover-bordercolo': '#8b9bff',
  '--btn-g-hover-color': '#8b9bff',
  '--btn-g-tx': '#e7e9f1',
  '--btn-img-bd': '#b79cf7',
  '--btn-img-bg': '#6454d8',
  '--btn-import-bd': '#f6bd4f',
  '--btn-import-tx': '#f6bd4f',
  '--btn-newgoogle-bd': '#232838',
  '--btn-newgoogle-tx': '#8189a1',
  '--btn-p-bg': '#8b9bff',
  '--btn-p-tx': '#0b0d14',
  '--btn-pin-bd': '#f6bd4f',
  '--btn-pin-bg': '#f6bd4f',
  '--btn-push-bd': '#8b9bff',
  '--btn-push-bg': '#8b9bff',
  '--btn-reset-bd': '#fb7185',
  '--btn-reset-bg': 'transparent',
  '--btn-reset-tx': '#fb7185',
  '--btn-save-bd': '#5361e0',
  '--btn-save-bg': '#5361e0',
  '--btn-save-tx-mobile': '#8b9bff',
  '--cal-arr-background': '#151925',
  '--cal-arr-border': '#232838',
  '--cal-arr-color': '#e7e9f1',
  '--cal-arr-hover-bordercolo': '#8b9bff',
  '--cal-arr-hover-color': '#8b9bff',
  '--cal-bg': '#151925',
  '--cal-day-border': '#232838',
  '--cal-day-neg-cal-day-num-color': '#fb7185',
  '--cal-day-neg-cal-pnl-color': '#fb7185',
  '--cal-day-num-color': '#8189a1',
  '--cal-day-pos-cal-day-num-color': '#34d399',
  '--cal-day-pos-cal-pnl-color': '#34d399',
  '--cal-day-today-bordercolo': '#8b9bff',
  '--cal-day-today-boxshadow': '#8b9bff',
  '--cal-dow-color': '#8189a1',
  '--cal-month-block-background': '#151925',
  '--cal-month-block-border': '#232838',
  '--cal-month-header-background': '#11141d',
  '--cal-month-header-borderbott': '#232838',
  '--cal-month-header-color': '#8189a1',
  '--cal-month-header-cur-color': '#8b9bff',
  '--cal-nav-surface-background': '#11141d',
  '--cal-nav-surface-border': '#232838',
  '--cal-nav-text': '#8b9bff',
  '--cal-neg-bd': '#fb7185',
  '--cal-neg-bg': 'rgba(251,113,133,0.16)',
  '--cal-pos-bd': '#34d399',
  '--cal-pos-bg': 'rgba(52,211,153,0.16)',
  '--cal-rr-cal-tc-color': '#8189a1',
  '--card': '#151925',
  '--card-background': '#151925',
  '--card-border': '#232838',
  '--card-header-background': '#11141d',
  '--card-header-borderbott': '#232838',
  '--card-title-color': '#aeb6d0',
  '--chart-card-border': '#232838',
  '--chart-header-background': '#11141d',
  '--chart-header-borderbott': '#232838',
  '--chart-title-color': '#aeb6d0',
  '--chip-background': '#11141d',
  '--chip-border': '#232838',
  '--chip-h-bd': '#8b9bff',
  '--chip-h-bg': 'rgba(139,155,255,0.12)',
  '--chip-h-tx': '#8b9bff',
  '--chip-s-bd': '#8b9bff',
  '--chip-s-bg': 'rgba(139,155,255,0.12)',
  '--chip-s-tx': '#8b9bff',
  '--clock-city-color': '#8189a1',
  '--clock-time-color': '#e7e9f1',
  '--comp-axis': '#8189a1',
  '--comp-bg': '#151925',
  '--comp-grid': 'rgba(129,137,161,0.1)',
  '--comp-neg': 'rgba(251,113,133,0.8)',
  '--comp-pos': 'rgba(52,211,153,0.8)',
  '--conf-neg': 'rgba(251,113,133,0.8)',
  '--conf-pos': 'rgba(52,211,153,0.8)',
  '--confirm-box-background': '#11141d',
  '--confirm-box-border': '#232838',
  '--confirm-box-h3-color': '#e7e9f1',
  '--confirm-box-p-color': '#8189a1',
  '--cf-link-background': '#11141d',
  '--cf-link-border': '#232838',
  '--cf-link-title': '#e7e9f1',
  '--cf-link-text': '#8189a1',
  '--cf-link-list-text': '#e7e9f1',
  '--cf-link-check': '#3b82f6',
  '--cp-collapse-btn-hover-bordercolo': '#8b9bff',
  '--cp-collapse-btn-hover-color': '#8b9bff',
  '--cp-hex-background': '#0b0d14',
  '--cp-hex-border': '#232838',
  '--cp-hex-color': '#e7e9f1',
  '--cp-hex-focus-bordercolo': '#8b9bff',
  '--cp-hue-lbl-color': '#8189a1',
  '--cp-mem-lbl-color': '#8189a1',
  '--cp-modal-background': '#11141d',
  '--cp-modal-border': '#232838',
  '--cp-ms-border': '#8189a1',
  '--cp-ms-hover-bordercolo': '#8b9bff',
  '--cp-sw-border': '#232838',
  '--cp-swatch-border': '#232838',
  '--cp-title-color': '#8b9bff',
  '--crt-assistant': '#aeb6d0',
  '--crt-capitalrisk': '#aeb6d0',
  '--crt-historique': '#aeb6d0',
  '--crt-nouveautrade': '#aeb6d0',
  '--crt-pires5': '#fb7185',
  '--crt-resume': '#aeb6d0',
  '--crt-riskreglages': '#aeb6d0',
  '--crt-sauvegarde': '#aeb6d0',
  '--crt-themestylo': '#aeb6d0',
  '--crt-top5': '#34d399',
  '--ct-comp-conf': '#aeb6d0',
  '--ct-comp-devises': '#aeb6d0',
  '--ct-comp-jours': '#aeb6d0',
  '--ct-comp-pairs': '#aeb6d0',
  '--ct-comp-sessions': '#aeb6d0',
  '--ct-comp-tf': '#aeb6d0',
  '--ct-evolution': '#aeb6d0',
  '--ct-mgmtimpact': '#aeb6d0',
  '--ct-pnl': '#aeb6d0',
  '--ct-riskmgmt': '#aeb6d0',
  '--ct-winrate': '#aeb6d0',
  '--del-btn-color': '#8189a1',
  '--del-btn-hover-color': '#fb7185',
  '--del-item-color': '#8189a1',
  '--del-item-hover-color': '#fb7185',
  '--drag-h-color': '#8189a1',
  '--empty-state-color': '#8189a1',
  '--eq-axis': '#8189a1',
  '--eq-bg': '#151925',
  '--eq-fill-bot': 'rgba(139,155,255,0)',
  '--eq-fill-top': 'rgba(139,155,255,0.28)',
  '--eq-grid': 'rgba(129,137,161,0.1)',
  '--eq-line': '#8b9bff',
  '--fc-add-btn-color': '#8b9bff',
  '--fc-audio-fill-color': '#8b9bff',
  '--fc-audio-play-bg': '#8b9bff',
  '--fc-bubble-mine-bg': '#1f2650',
  '--fc-bubble-text': '#e7e9f1',
  '--fc-bubble-theirs-bg': '#11141d',
  '--fc-bubble-theirs-border': '#232838',
  '--fc-cancel-color': '#fb7185',
  '--fc-contact-active-bg': '#1c2347',
  '--fc-icon-color': '#8189a1',
  '--fc-react-badge-bg': '#151925',
  '--fc-react-trigger-bg': '#11141d',
  '--fc-rec-dot-color': '#fb7185',
  '--fc-send-color': '#8b9bff',
  '--fc-sidebar-bg': '#11141d',
  '--fc-time-color': '#8189a1',
  '--fc-trade-chip-bg': '#11141d',
  '--fc-trade-head-bg': '#11141d',
  '--fc-trade-neg-color': '#fb7185',
  '--fc-trade-pos-color': '#34d399',
  '--fc-unread-dot-color': '#fb7185',
  '--fc-wave-color': '#8b9bff',
  '--fg-input-fg-select-fg-textarea-background': '#11141d',
  '--fg-input-fg-select-fg-textarea-border': '#232838',
  '--fg-input-fg-select-fg-textarea-color': '#e7e9f1',
  '--fg-input-focus-fg-select-focus-fg-t-bordercolo': '#8b9bff',
  '--fg-label-color': '#8189a1',
  '--fg-select-option-background': '#151925',
  '--footer-color': '#8189a1',
  '--green': '#34d399',
  '--hamburger-border': '#232838',
  '--hamburger-color': '#e7e9f1',
  '--history-grid-color': 'rgba(35,40,56,0.7)',
  '--ia-bar-cancel-color': '#fb7185',
  '--ia-bar-icon-color': '#8189a1',
  '--ia-bar-rec-dot-color': '#fb7185',
  '--ia-bar-send-color': '#8b9bff',
  '--ia-bar-wave-color': '#8b9bff',
  '--ia-bot-bd': '#232838',
  '--ia-bot-bg': '#151925',
  '--ia-bot-tx': '#e7e9f1',
  '--ia-empty-tx': '#8189a1',
  '--ia-user-bg': '#222a55',
  '--ia-user-tx': '#e7e9f1',
  '--kpi-card-background': '#151925',
  '--kpi-label-color': '#8189a1',
  '--kpi-strip-background': '#232838',
  '--kpi1': '#8b9bff',
  '--kpi2': '#56b9f2',
  '--kpi3': '#b79cf7',
  '--kpi4': '#f6bd4f',
  '--kpi5': '#f283b6',
  '--kpi6': '#34d399',
  '--kpi7': '#8189a1',
  '--kpi8': '#f6bd4f',
  '--kpi9': '#fb7185',
  '--loading-screen-bg': '#0b0d14',
  '--mgmt-axis': '#8189a1',
  '--mgmt-bg': '#151925',
  '--mgmt-grid': 'rgba(129,137,161,0.1)',
  '--mgmt-no': '#fb7185',
  '--mgmt-no-alpha': 'rgba(251,113,133,0.35)',
  '--mgmt-no-bd': '#fb7185',
  '--mgmt-type-0': '#34d399',
  '--mgmt-type-0-alpha': 'rgba(52,211,153,0.45)',
  '--mgmt-type-0-bd': '#34d399',
  '--mgmt-type-1': '#fb7185',
  '--mgmt-type-1-alpha': 'rgba(251,113,133,0.45)',
  '--mgmt-type-1-bd': '#fb7185',
  '--mgmt-type-10': '#f6bd4f',
  '--mgmt-type-10-alpha': 'rgba(246,189,79,0.45)',
  '--mgmt-type-10-bd': '#f6bd4f',
  '--mgmt-type-11': '#56b9f2',
  '--mgmt-type-11-alpha': 'rgba(86,185,242,0.45)',
  '--mgmt-type-11-bd': '#56b9f2',
  '--mgmt-type-12': '#b79cf7',
  '--mgmt-type-12-alpha': 'rgba(183,156,247,0.45)',
  '--mgmt-type-12-bd': '#b79cf7',
  '--mgmt-type-13': '#f283b6',
  '--mgmt-type-13-alpha': 'rgba(242,131,182,0.45)',
  '--mgmt-type-13-bd': '#f283b6',
  '--mgmt-type-14': '#3fd0d8',
  '--mgmt-type-14-alpha': 'rgba(63,208,216,0.45)',
  '--mgmt-type-14-bd': '#3fd0d8',
  '--mgmt-type-15': '#f79a5b',
  '--mgmt-type-15-alpha': 'rgba(247,154,91,0.45)',
  '--mgmt-type-15-bd': '#f79a5b',
  '--mgmt-type-16': '#34d399',
  '--mgmt-type-16-alpha': 'rgba(52,211,153,0.45)',
  '--mgmt-type-16-bd': '#34d399',
  '--mgmt-type-17': '#fb7185',
  '--mgmt-type-17-alpha': 'rgba(251,113,133,0.45)',
  '--mgmt-type-17-bd': '#fb7185',
  '--mgmt-type-18': '#f6bd4f',
  '--mgmt-type-18-alpha': 'rgba(246,189,79,0.45)',
  '--mgmt-type-18-bd': '#f6bd4f',
  '--mgmt-type-19': '#56b9f2',
  '--mgmt-type-19-alpha': 'rgba(86,185,242,0.45)',
  '--mgmt-type-19-bd': '#56b9f2',
  '--mgmt-type-2': '#f6bd4f',
  '--mgmt-type-2-alpha': 'rgba(246,189,79,0.45)',
  '--mgmt-type-2-bd': '#f6bd4f',
  '--mgmt-type-20': '#b79cf7',
  '--mgmt-type-20-alpha': 'rgba(183,156,247,0.45)',
  '--mgmt-type-20-bd': '#b79cf7',
  '--mgmt-type-21': '#f283b6',
  '--mgmt-type-21-alpha': 'rgba(242,131,182,0.45)',
  '--mgmt-type-21-bd': '#f283b6',
  '--mgmt-type-22': '#3fd0d8',
  '--mgmt-type-22-alpha': 'rgba(63,208,216,0.45)',
  '--mgmt-type-22-bd': '#3fd0d8',
  '--mgmt-type-23': '#f79a5b',
  '--mgmt-type-23-alpha': 'rgba(247,154,91,0.45)',
  '--mgmt-type-23-bd': '#f79a5b',
  '--mgmt-type-24': '#34d399',
  '--mgmt-type-24-alpha': 'rgba(52,211,153,0.45)',
  '--mgmt-type-24-bd': '#34d399',
  '--mgmt-type-25': '#fb7185',
  '--mgmt-type-25-alpha': 'rgba(251,113,133,0.45)',
  '--mgmt-type-25-bd': '#fb7185',
  '--mgmt-type-26': '#f6bd4f',
  '--mgmt-type-26-alpha': 'rgba(246,189,79,0.45)',
  '--mgmt-type-26-bd': '#f6bd4f',
  '--mgmt-type-27': '#56b9f2',
  '--mgmt-type-27-alpha': 'rgba(86,185,242,0.45)',
  '--mgmt-type-27-bd': '#56b9f2',
  '--mgmt-type-28': '#b79cf7',
  '--mgmt-type-28-alpha': 'rgba(183,156,247,0.45)',
  '--mgmt-type-28-bd': '#b79cf7',
  '--mgmt-type-29': '#f283b6',
  '--mgmt-type-29-alpha': 'rgba(242,131,182,0.45)',
  '--mgmt-type-29-bd': '#f283b6',
  '--mgmt-type-3': '#56b9f2',
  '--mgmt-type-3-alpha': 'rgba(86,185,242,0.45)',
  '--mgmt-type-3-bd': '#56b9f2',
  '--mgmt-type-30': '#3fd0d8',
  '--mgmt-type-30-alpha': 'rgba(63,208,216,0.45)',
  '--mgmt-type-30-bd': '#3fd0d8',
  '--mgmt-type-31': '#f79a5b',
  '--mgmt-type-31-alpha': 'rgba(247,154,91,0.45)',
  '--mgmt-type-31-bd': '#f79a5b',
  '--mgmt-type-4': '#b79cf7',
  '--mgmt-type-4-alpha': 'rgba(183,156,247,0.45)',
  '--mgmt-type-4-bd': '#b79cf7',
  '--mgmt-type-5': '#f283b6',
  '--mgmt-type-5-alpha': 'rgba(242,131,182,0.45)',
  '--mgmt-type-5-bd': '#f283b6',
  '--mgmt-type-6': '#3fd0d8',
  '--mgmt-type-6-alpha': 'rgba(63,208,216,0.45)',
  '--mgmt-type-6-bd': '#3fd0d8',
  '--mgmt-type-7': '#f79a5b',
  '--mgmt-type-7-alpha': 'rgba(247,154,91,0.45)',
  '--mgmt-type-7-bd': '#f79a5b',
  '--mgmt-type-8': '#34d399',
  '--mgmt-type-8-alpha': 'rgba(52,211,153,0.45)',
  '--mgmt-type-8-bd': '#34d399',
  '--mgmt-type-9': '#fb7185',
  '--mgmt-type-9-alpha': 'rgba(251,113,133,0.45)',
  '--mgmt-type-9-bd': '#fb7185',
  '--mgmt-yes': '#34d399',
  '--mgmt-yes-alpha': 'rgba(52,211,153,0.35)',
  '--mgmt-yes-bd': '#34d399',
  '--mobile-menu-nav-tab-border': '#232838',
  '--mobile-menu-nav-tab-borderbott': '#232838',
  '--mod-add-bordertop': '#232838',
  '--mod-add-button-background': '#8b9bff',
  '--mod-add-input-background': '#0b0d14',
  '--mod-add-input-border': '#232838',
  '--mod-add-input-color': '#e7e9f1',
  '--mod-add-input-focus-bordercolo': '#8b9bff',
  '--mod-col-background': '#151925',
  '--mod-col-border': '#232838',
  '--mod-col-hdr-background': '#11141d',
  '--mod-col-hdr-borderbott': '#232838',
  '--mod-item-background': '#11141d',
  '--msg-banner-bg': '#d94452',
  '--msg-banner-tx': '#ffffff',
  '--msg-error': '#fb7185',
  '--msg-neutral': '#8189a1',
  '--msg-success': '#34d399',
  '--msg-warning': '#f6bd4f',
  '--mt-confluences': '#34d399',
  '--mt-devises': '#56b9f2',
  '--mt-mgmt': '#f283b6',
  '--mt-paires': '#56b9f2',
  '--mt-reprend': '#8189a1',
  '--mt-sessions': '#b79cf7',
  '--mt-timeframes': '#f6bd4f',
  '--muted': '#8189a1',
  '--nav-bg': '#11141d',
  '--nav-border': '#232838',
  '--nav-logo': '#8b9bff',
  '--nav-tab-active-borderbott': '#8b9bff',
  '--nav-tab-active-color': '#8b9bff',
  '--nav-tab-color': '#8189a1',
  '--nav-tab-hover-color': '#e7e9f1',
  '--page-sub-color': '#8189a1',
  '--page-title-color': '#8b9bff',
  '--pbtn-active-background': '#8b9bff',
  '--pbtn-active-bordercolo': '#8b9bff',
  '--pbtn-border': '#232838',
  '--pbtn-color': '#8189a1',
  '--pbtn-hover-bordercolo': '#8b9bff',
  '--pbtn-hover-color': '#8b9bff',
  '--pc-chat-title-bar-color': '#8189a1',
  '--pc-conv-empty-color': '#8189a1',
  '--pc-conv-header-borderbott': '#232838',
  '--pc-conv-header-title-color': '#8b9bff',
  '--pc-conv-item-active-background': '#11141d',
  '--pc-conv-item-active-border': '#232838',
  '--pc-conv-item-color': '#e7e9f1',
  '--pc-conv-item-del-hover-color': '#fb7185',
  '--pc-conv-item-hover-background': '#11141d',
  '--pc-conv-panel-background': '#0b0d14',
  '--pc-conv-panel-borderrigh': '#232838',
  '--pc-icon-btn-background': '#11141d',
  '--pc-icon-btn-border': '#232838',
  '--pc-icon-btn-color': '#e7e9f1',
  '--pc-icon-btn-hover-bordercolo': '#8b9bff',
  '--pc-icon-btn-hover-color': '#8b9bff',
  '--pc-negatif': '#fb7185',
  '--pc-positif': '#34d399',
  '--pc-resume-border': '#232838',
  '--pcal-bd': '#232838',
  '--pcal-bg': '#11141d',
  '--pcal-btn-active-bd': '#8b9bff',
  '--pcal-btn-active-bg': '#8b9bff',
  '--pcal-btn-active-ic': '#0b0d14',
  '--pcal-btn-bd': '#232838',
  '--pcal-btn-bg': '#11141d',
  '--pcal-btn-hover-bd': '#8b9bff',
  '--pcal-btn-hover-ic': '#8b9bff',
  '--pcal-btn-ic': '#8189a1',
  '--pcal-clear-bd': '#232838',
  '--pcal-clear-bg': '#11141d',
  '--pcal-clear-tx': '#e7e9f1',
  '--pcal-day-hover-bg': '#232838',
  '--pcal-day-tx': '#e7e9f1',
  '--pcal-hint-tx': '#8189a1',
  '--pcal-nav': '#8189a1',
  '--pcal-nav-hover': '#8b9bff',
  '--pcal-range-bg': '#1f2548',
  '--pcal-range-tx': '#e7e9f1',
  '--pcal-sel-bg': '#8b9bff',
  '--pcal-sel-tx': '#0b0d14',
  '--pcal-title': '#e7e9f1',
  '--pcal-today-bd': '#8b9bff',
  '--pcal-wd': '#8189a1',
  '--pencil-hover-outline': '#8b9bff',
  '--pencil-toolbar-bg': '#11141d',
  '--pencil-toolbar-border': '#232838',
  '--pencilcolorswatch-border': '#232838',
  '--pencilfontsize-background': '#0b0d14',
  '--pencilfontsize-border': '#232838',
  '--pencilfontsize-color': '#e7e9f1',
  '--pf-add-bd': '#232838',
  '--pf-add-bg': '#11141d',
  '--pf-add-tx': '#e7e9f1',
  '--pf-remove-bd': '#232838',
  '--pf-remove-bg': '#11141d',
  '--pf-remove-tx': '#e7e9f1',
  '--pie-lose': 'rgba(251,113,133,0.85)',
  '--pie-neutral': 'rgba(129,137,161,0.6)',
  '--pie-win': 'rgba(52,211,153,0.85)',
  '--pin-btn-bd': '#232838',
  '--pin-btn-bg': '#11141d',
  '--pin-btn-tx': '#e7e9f1',
  '--pin-dot-off': '#30374b',
  '--pin-dot-on': '#8b9bff',
  '--pnl-avg-gain': '#34d399',
  '--pnl-avg-loss': '#f6bd4f',
  '--pnl-axis': '#8189a1',
  '--pnl-bar-neg': '#fb7185',
  '--pnl-bar-pos': '#34d399',
  '--pnl-bg': '#151925',
  '--pnl-grid': 'rgba(129,137,161,0.1)',
  '--profile-edit-avatar-background': '#232838',
  '--profile-edit-avatar-border': '#232838',
  '--profile-edit-hint-color': '#8189a1',
  '--ps-trackrecord': '#8189a1',
  '--pt-ami': '#8b9bff',
  '--pt-calendrier': '#8b9bff',
  '--pt-journal': '#8b9bff',
  '--pt-modifs': '#8b9bff',
  '--pt-pointscles': '#8b9bff',
  '--pt-trackrecord': '#8b9bff',
  '--pxd-mode-active-tx': '#8b9bff',
  '--red': '#fb7185',
  '--result-neg': '#fb7185',
  '--result-pos': '#34d399',
  '--risk-axis': '#f6bd4f',
  '--risk-base': 'rgba(129,137,161,0.5)',
  '--risk-bg': '#151925',
  '--risk-euro-tx': '#56b9f2',
  '--risk-fill-bot': 'rgba(246,189,79,0)',
  '--risk-fill-top': 'rgba(246,189,79,0.25)',
  '--risk-grid': 'rgba(129,137,161,0.1)',
  '--risk-line': '#f6bd4f',
  '--rm-down-border': '#fb7185',
  '--rm-down-text': '#fb7185',
  '--rm-up-border': '#34d399',
  '--risk-event-color': '#f6bd4f',
  '--rm-adjust-btn-background': '#1b2030',
  '--rm-adjust-btn-border': '#f6bd4f',
  '--rm-adjust-btn-color': '#f6bd4f',
  '--rm-up-text': '#34d399',
  '--row-hover': 'rgba(139,155,255,0.06)',
  '--session-bg': 'rgba(139,155,255,0.12)',
  '--session-border': 'rgba(139,155,255,0.3)',
  '--session-text': '#8b9bff',
  '--state-capital': '#8b9bff',
  '--state-card-bg': '#11141d',
  '--state-card-border': '#232838',
  '--state-tf': '#56b9f2',
  '--state-winstreak': '#34d399',
  '--surface': '#11141d',
  '--tag-long-bg': 'rgba(52,211,153,0.15)',
  '--tag-long-tx': '#34d399',
  '--tag-mgmt-0-bd': '#34d399',
  '--tag-mgmt-0-bg': 'rgba(52,211,153,0.12)',
  '--tag-mgmt-0-tx': '#34d399',
  '--tag-mgmt-1-bd': '#fb7185',
  '--tag-mgmt-1-bg': 'rgba(251,113,133,0.12)',
  '--tag-mgmt-1-tx': '#fb7185',
  '--tag-mgmt-10-bd': '#f6bd4f',
  '--tag-mgmt-10-bg': 'rgba(246,189,79,0.12)',
  '--tag-mgmt-10-tx': '#f6bd4f',
  '--tag-mgmt-11-bd': '#56b9f2',
  '--tag-mgmt-11-bg': 'rgba(86,185,242,0.12)',
  '--tag-mgmt-11-tx': '#56b9f2',
  '--tag-mgmt-12-bd': '#b79cf7',
  '--tag-mgmt-12-bg': 'rgba(183,156,247,0.12)',
  '--tag-mgmt-12-tx': '#b79cf7',
  '--tag-mgmt-13-bd': '#f283b6',
  '--tag-mgmt-13-bg': 'rgba(242,131,182,0.12)',
  '--tag-mgmt-13-tx': '#f283b6',
  '--tag-mgmt-14-bd': '#3fd0d8',
  '--tag-mgmt-14-bg': 'rgba(63,208,216,0.12)',
  '--tag-mgmt-14-tx': '#3fd0d8',
  '--tag-mgmt-15-bd': '#f79a5b',
  '--tag-mgmt-15-bg': 'rgba(247,154,91,0.12)',
  '--tag-mgmt-15-tx': '#f79a5b',
  '--tag-mgmt-16-bd': '#34d399',
  '--tag-mgmt-16-bg': 'rgba(52,211,153,0.12)',
  '--tag-mgmt-16-tx': '#34d399',
  '--tag-mgmt-17-bd': '#fb7185',
  '--tag-mgmt-17-bg': 'rgba(251,113,133,0.12)',
  '--tag-mgmt-17-tx': '#fb7185',
  '--tag-mgmt-18-bd': '#f6bd4f',
  '--tag-mgmt-18-bg': 'rgba(246,189,79,0.12)',
  '--tag-mgmt-18-tx': '#f6bd4f',
  '--tag-mgmt-19-bd': '#56b9f2',
  '--tag-mgmt-19-bg': 'rgba(86,185,242,0.12)',
  '--tag-mgmt-19-tx': '#56b9f2',
  '--tag-mgmt-2-bd': '#f6bd4f',
  '--tag-mgmt-2-bg': 'rgba(246,189,79,0.12)',
  '--tag-mgmt-2-tx': '#f6bd4f',
  '--tag-mgmt-20-bd': '#b79cf7',
  '--tag-mgmt-20-bg': 'rgba(183,156,247,0.12)',
  '--tag-mgmt-20-tx': '#b79cf7',
  '--tag-mgmt-21-bd': '#f283b6',
  '--tag-mgmt-21-bg': 'rgba(242,131,182,0.12)',
  '--tag-mgmt-21-tx': '#f283b6',
  '--tag-mgmt-22-bd': '#3fd0d8',
  '--tag-mgmt-22-bg': 'rgba(63,208,216,0.12)',
  '--tag-mgmt-22-tx': '#3fd0d8',
  '--tag-mgmt-23-bd': '#f79a5b',
  '--tag-mgmt-23-bg': 'rgba(247,154,91,0.12)',
  '--tag-mgmt-23-tx': '#f79a5b',
  '--tag-mgmt-24-bd': '#34d399',
  '--tag-mgmt-24-bg': 'rgba(52,211,153,0.12)',
  '--tag-mgmt-24-tx': '#34d399',
  '--tag-mgmt-25-bd': '#fb7185',
  '--tag-mgmt-25-bg': 'rgba(251,113,133,0.12)',
  '--tag-mgmt-25-tx': '#fb7185',
  '--tag-mgmt-26-bd': '#f6bd4f',
  '--tag-mgmt-26-bg': 'rgba(246,189,79,0.12)',
  '--tag-mgmt-26-tx': '#f6bd4f',
  '--tag-mgmt-27-bd': '#56b9f2',
  '--tag-mgmt-27-bg': 'rgba(86,185,242,0.12)',
  '--tag-mgmt-27-tx': '#56b9f2',
  '--tag-mgmt-28-bd': '#b79cf7',
  '--tag-mgmt-28-bg': 'rgba(183,156,247,0.12)',
  '--tag-mgmt-28-tx': '#b79cf7',
  '--tag-mgmt-29-bd': '#f283b6',
  '--tag-mgmt-29-bg': 'rgba(242,131,182,0.12)',
  '--tag-mgmt-29-tx': '#f283b6',
  '--tag-mgmt-3-bd': '#56b9f2',
  '--tag-mgmt-3-bg': 'rgba(86,185,242,0.12)',
  '--tag-mgmt-3-tx': '#56b9f2',
  '--tag-mgmt-30-bd': '#3fd0d8',
  '--tag-mgmt-30-bg': 'rgba(63,208,216,0.12)',
  '--tag-mgmt-30-tx': '#3fd0d8',
  '--tag-mgmt-31-bd': '#f79a5b',
  '--tag-mgmt-31-bg': 'rgba(247,154,91,0.12)',
  '--tag-mgmt-31-tx': '#f79a5b',
  '--tag-mgmt-4-bd': '#b79cf7',
  '--tag-mgmt-4-bg': 'rgba(183,156,247,0.12)',
  '--tag-mgmt-4-tx': '#b79cf7',
  '--tag-mgmt-5-bd': '#f283b6',
  '--tag-mgmt-5-bg': 'rgba(242,131,182,0.12)',
  '--tag-mgmt-5-tx': '#f283b6',
  '--tag-mgmt-6-bd': '#3fd0d8',
  '--tag-mgmt-6-bg': 'rgba(63,208,216,0.12)',
  '--tag-mgmt-6-tx': '#3fd0d8',
  '--tag-mgmt-7-bd': '#f79a5b',
  '--tag-mgmt-7-bg': 'rgba(247,154,91,0.12)',
  '--tag-mgmt-7-tx': '#f79a5b',
  '--tag-mgmt-8-bd': '#34d399',
  '--tag-mgmt-8-bg': 'rgba(52,211,153,0.12)',
  '--tag-mgmt-8-tx': '#34d399',
  '--tag-mgmt-9-bd': '#fb7185',
  '--tag-mgmt-9-bg': 'rgba(251,113,133,0.12)',
  '--tag-mgmt-9-tx': '#fb7185',
  '--tag-na-bg': 'rgba(129,137,161,0.1)',
  '--tag-na-tx': '#8189a1',
  '--tag-non-bg': 'rgba(251,113,133,0.12)',
  '--tag-non-tx': '#fb7185',
  '--tag-oui-bg': 'rgba(52,211,153,0.12)',
  '--tag-oui-tx': '#34d399',
  '--tag-peut-bg': 'rgba(246,189,79,0.15)',
  '--tag-peut-tx': '#f6bd4f',
  '--tag-short-bg': 'rgba(251,113,133,0.15)',
  '--tag-short-tx': '#fb7185',
  '--te-page-background': '#0b0d14',
  '--te-page-border': '#232838',
  '--te-page-title-before-color': '#8189a1',
  '--te-page-title-color': '#e7e9f1',
  '--te-search-background': '#0b0d14',
  '--te-search-border': '#232838',
  '--te-search-color': '#e7e9f1',
  '--te-sec-title-borderbott': '#232838',
  '--te-sec-title-color': '#8189a1',
  '--te-swatch-border': '#232838',
  '--te-swatch-hover-bordercolo': '#8b9bff',
  '--text': '#e7e9f1',
  '--tgl-border': '#4b5268',
  '--tgl-off': '#2b3144',
  '--tgl-on': '#8b9bff',
  '--tgl-row-color': '#8189a1',
  '--tgl-wrap-color': '#8189a1',
  '--thead-th-background': '#11141d',
  '--thead-th-borderbott': '#232838',
  '--thead-th-color': '#8189a1',
  '--top5-row-border': '#232838',
  '--undo-toast-background': '#11141d',
  '--undo-toast-border': '#232838',
  '--undo-toast-btn-border': '#8b9bff',
  '--undo-toast-btn-color': '#8b9bff',
  '--undo-toast-color': '#e7e9f1',
  '--winrate-slice-border': '#0b0d14'
};

  var MGMT_NEW = [
  {bg: 'rgba(52,211,153,.12)', tx: '#34d399', bd: '#34d399'},
  {bg: 'rgba(251,113,133,.12)', tx: '#fb7185', bd: '#fb7185'},
  {bg: 'rgba(246,189,79,.12)', tx: '#f6bd4f', bd: '#f6bd4f'},
  {bg: 'rgba(86,185,242,.12)', tx: '#56b9f2', bd: '#56b9f2'},
  {bg: 'rgba(183,156,247,.12)', tx: '#b79cf7', bd: '#b79cf7'},
  {bg: 'rgba(242,131,182,.12)', tx: '#f283b6', bd: '#f283b6'},
  {bg: 'rgba(63,208,216,.12)', tx: '#3fd0d8', bd: '#3fd0d8'},
  {bg: 'rgba(247,154,91,.12)', tx: '#f79a5b', bd: '#f79a5b'}
];

  // ── 3. Style : nouvelles valeurs + couleurs écrites en dur ───────────
  var CSS =
    'html:root{' +
    Object.keys(NEW)
      .map(function (k) {
        return k + ':' + NEW[k] + ';';
      })
      .join('') +
    '}\n' +
    `/* Couleurs écrites en dur dans style.css / index.html (hors variables) */
.acc-opt-btn-danger { color: #fb7185; }
.pbtn.active { color: #0b0d14; }
.mod-add button { color: #0b0d14; }
body.pencil-mode [data-editable] { outline-color: rgba(139, 155, 255, 0.5); }
body.pencil-mode [data-editable]:hover { background: rgba(139, 155, 255, 0.06); }
.undo-toast-btn:active { background: rgba(139, 155, 255, 0.1); }
.alert { background: rgba(52, 211, 153, 0.08); border-color: rgba(52, 211, 153, 0.25); }
tbody tr { border-bottom-color: rgba(35, 40, 56, 0.7); }
.auth-err { color: #fb7185; }
.star-pick { color: #30374b; }
.star-pick.half { background: linear-gradient(to right, #f6bd4f 50%, #30374b 50%); -webkit-background-clip: text; background-clip: text; }
.star-pick.on { color: #f6bd4f; -webkit-text-fill-color: #f6bd4f; }
.star-pick:not(.on):not(.half) { color: #30374b; -webkit-text-fill-color: #30374b; }
#syncStatus { background: #151925 !important; border-color: #232838 !important; }`;
  var styleTag = document.createElement('style');
  styleTag.id = 'tjp-theme-v2-style';
  styleTag.textContent = CSS;
  document.head.appendChild(styleTag);

  // ── 4. Tableaux de défauts existants, mis à jour sur place ───────────
  function patchDefaults(obj) {
    if (!obj) return;
    Object.keys(obj).forEach(function (k) {
      if (NEW[k] !== undefined) obj[k] = NEW[k];
    });
  }
  try {
    if (typeof TITLE_DEFAULTS !== 'undefined') patchDefaults(TITLE_DEFAULTS);
    if (typeof IA_BAR_DEFAULTS !== 'undefined') patchDefaults(IA_BAR_DEFAULTS);
    if (typeof FC_THEME_DEFAULTS !== 'undefined') patchDefaults(FC_THEME_DEFAULTS);
    if (typeof MGMT_PALETTE !== 'undefined')
      MGMT_PALETTE.forEach(function (p, i) {
        if (MGMT_NEW[i]) Object.assign(p, MGMT_NEW[i]);
      });
  } catch (e) {
    console.warn('Thème V2 — défauts :', e);
  }

  // ── 5. Défauts existants ré-appliqués (aucune migration : les thèmes déjà
  //    enregistrés ne sont plus touchés, la nouvelle base ne s'applique qu'à un
  //    nouveau compte ou après « Réinitialiser » dans le thème) ──
  var MARK = '--tjp-theme-v2'; // ancien marqueur éventuellement resté dans un thème enregistré
  function ensureDefaults() {
    ['ensureMgmtThemeDefaults', 'ensureTitleThemeDefaults', 'ensureIaComposerThemeDefaults', 'fcEnsureThemeDefaults'].forEach(
      function (fn) {
        try {
          if (typeof window[fn] === 'function') window[fn]();
        } catch (e) {}
      }
    );
  }

  // ── 6. Déconnexion : proposer aussi la sauvegarde locale si le THÈME a changé ──
  function themeSig() {
    try {
      var o = {};
      Object.keys(teVals || {}).sort().forEach(function (k) { if (k !== MARK) o[k] = teVals[k]; });
      return JSON.stringify(o);
    } catch (e) { return ''; }
  }
  function sigKey() { return 'tj_last_backup_theme__' + (typeof profileKey === 'function' ? profileKey('x') : ''); }
  if (typeof window.resetPin === 'function') {
    var origReset = window.resetPin;
    window.resetPin = function () {
      try {
        var saved = localStorage.getItem(sigKey());
        var cur = themeSig();
        if (cur !== '{}' && cur !== (saved == null ? '{}' : saved) && typeof accKey === 'function')
          localStorage.setItem(accKey('tj_last_backup_hash'), '');
      } catch (e) {}
      return origReset.apply(this, arguments);
    };
  }
  if (typeof window.exportLocalBackup === 'function') {
    var origExport = window.exportLocalBackup;
    window.exportLocalBackup = function () {
      var r = origExport.apply(this, arguments);
      try { localStorage.setItem(sigKey(), themeSig()); } catch (e) {}
      return r;
    };
  }

  // Passage immédiat (aperçu déjà posé au démarrage, thème déjà chargé...)
  ensureDefaults();
})();


// Petits messages en bas à droite (« ✓ Sauvegardé », « ⚠ Réseau »...) : couleurs
// de texte, de fond et de bordure modifiables dans Paramètres > Thème, avec deux
// familles distinctes : confirmation (✓) et erreur / avertissement (⚠).
(function () {
  var DEF = {
    '--toast-ok-tx': '#34d399',
    '--toast-ok-bg': '#10231d',
    '--toast-ok-bd': '#1f5c47',
    '--toast-err-tx': '#fb7185',
    '--toast-err-bg': '#2a1218',
    '--toast-err-bd': '#6b2433'
  };
  var st = document.createElement('style');
  st.textContent = ':root{' + Object.keys(DEF).map(function (k) { return k + ':' + DEF[k]; }).join(';') + '}';
  document.head.appendChild(st);

  var LIST = [
    ['--toast-ok-tx', 'Notification confirmation (ex: Sauvegardé) — texte'],
    ['--toast-ok-bg', 'Notification confirmation — fond'],
    ['--toast-ok-bd', 'Notification confirmation — bordure'],
    ['--toast-err-tx', 'Notification erreur (ex: Réseau) — texte'],
    ['--toast-err-bg', 'Notification erreur — fond'],
    ['--toast-err-bd', 'Notification erreur — bordure']
  ].map(function (a) {
    return { v: a[0], l: a[1], page: 'Général', section: 'Messages système' };
  });

  if (typeof window.buildTV === 'function') {
    var origTV = window.buildTV;
    window.buildTV = function () {
      return origTV.apply(this, arguments).concat(LIST);
    };
  }

  function kind(msg) {
    msg = String(msg == null ? '' : msg).replace(/^\s+/, '');
    if (msg.charAt(0) === '✓') return 'ok';
    if (msg.charAt(0) === '⚠') return 'err';
    return '';
  }
  if (typeof window.showSync === 'function') {
    var orig = window.showSync;
    window.showSync = function (msg) {
      var r = orig.apply(this, arguments);
      try {
        var el = document.getElementById('syncStatus');
        if (!el) return r;
        var k = kind(msg);
        if (k) {
          var n = '--toast-' + k;
          el.style.setProperty('color', 'var(' + n + '-tx)', 'important');
          el.style.setProperty('background', 'var(' + n + '-bg)', 'important');
          el.style.setProperty('border-color', 'var(' + n + '-bd)', 'important');
        } else {
          el.style.removeProperty('background');
          el.style.removeProperty('border-color');
        }
      } catch (e) {}
      return r;
    };
  }
})();
