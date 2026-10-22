// ══════════════════════════════════════════════════════════════════════════
// CHAT AMIS (TJP) — page "Ami"
// ──────────────────────────────────────────────────────────────────────────
// Module 100% additif : ne modifie AUCUNE fonction existante par édition
// directe. Il surcharge (wrap) quelques fonctions globales (saveProfile,
// afterPinValidated, _doResetPin) et construit tout le reste au runtime
// (DOM + CSS injectés dans #page-ami, qui est vide à l'origine). Pour
// désactiver entièrement cette fonctionnalité, il suffit de retirer la
// balise <script src="friends-chat.js"> — aucun autre fichier n'est touché.
//
// Fonctionnalités :
//  - Liste d'amis (ajout par pseudo), format WhatsApp : colonne de gauche
//    avec les contacts, conversation à droite.
//  - Messages texte, messages vocaux (rester appuyé sur le micro sur
//    téléphone, clic simple sur PC), et partage de la fiche technique
//    complète d'un trade (infos + notes + images + réponses aux graphiques
//    personnalisés), pas seulement une image isolée.
//  - Réactions emoji sur les messages (un seul emoji par personne et par
//    message, façon WhatsApp).
//  - Sur PC : contacts affichés avec pseudo + photo. Sur téléphone :
//    uniquement la photo (grille compacte), conversation en plein écran
//    avec bouton retour.
//  - Temps réel via Supabase Realtime (mêmes principes que la sync des
//    trades) + repli propre si la migration SQL n'a pas encore été
//    appliquée (message explicite au lieu d'un écran cassé).
//
// Nécessite la migration SQL "migration_chat.sql" (tables tjp_profiles /
// tjp_contacts / tjp_messages + policies RLS + bucket de stockage
// "chat-audio") ET la migration "migration_chat_reactions.sql" (table
// tjp_message_reactions) pour les réactions emoji. Tant qu'une migration
// n'est pas appliquée, la fonctionnalité correspondante se dégrade
// proprement (message explicite ou réactions simplement indisponibles)
// au lieu de planter.
// ══════════════════════════════════════════════════════════════════════════

const FC_PROFILES_TABLE = 'tjp_profiles';
const FC_CONTACTS_TABLE = 'tjp_contacts';
const FC_MESSAGES_TABLE = 'tjp_messages';
const FC_REACTIONS_TABLE = 'tjp_message_reactions';
const FC_READS_TABLE = 'tjp_chat_reads';
const FC_PUSH_TABLE = 'tjp_push_subscriptions';
// Clé publique VAPID (sans risque à exposer côté client, c'est fait pour).
const FC_VAPID_PUBLIC_KEY =
  'BNXA5IwEkW_17PhSBsNGid5-i8ESTs_4bwf7N2EPyMmrnHs1YY7QBifmiHZeAYVcy3jfhM5W6UwNS68umahwl7c';
const FC_PUSH_SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window;
const FC_AUDIO_BUCKET = 'chat-audio';
const FC_REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// FC_EMOJI_CATEGORIES est défini dans emoji-data.js (chargé juste avant ce
// fichier) : vraies données Unicode officielles, pas un tableau tapé à la main.
if (typeof FC_EMOJI_CATEGORIES === 'undefined') {
  // Repli minimal si emoji-data.js n'est pas chargé (le bouton "+" du picker
  // de réactions n'affichera alors que ce petit jeu, sans planter). Une
  // affectation sur window (et non "var") : "var" entrerait en conflit avec
  // le "const" du même nom déclaré dans emoji-data.js quand les deux
  // fichiers sont chargés ensemble, et casserait tout ce script.
  window.FC_EMOJI_CATEGORIES = [{ icon: '🙂', name: 'Emoji', emojis: FC_REACT_EMOJIS }];
}

// Icônes vectorielles simples (currentColor : suivent la couleur du bouton),
// pour éviter le rendu incohérent des emoji selon les appareils (ex: 🎤 qui
// s'affiche en simple point sur certains claviers/polices Android).
const FC_ICON_MIC =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15z"/><path d="M18 11.5a1 1 0 0 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.92V19h-1.5a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2H13v-1.58a6 6 0 0 0 5-5.92z"/></svg>';
const FC_ICON_SEND =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M3.4 20.6l17.45-8.3a1 1 0 0 0 0-1.8L3.4 2.2a1 1 0 0 0-1.4 1.1l1.9 7L15 12 3.9 13.7l-1.9 7a1 1 0 0 0 1.4 1.1z"/></svg>';
const FC_ICON_TRASH =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
const FC_ICON_ATTACH =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7l-7.5 7.5a3 3 0 0 0 4.24 4.24L21 12.4a5 5 0 0 0-7.07-7.07L6.5 12.7a2 2 0 0 0 2.83 2.83L16 9"/></svg>';

// ── État ──
let fcContacts = []; // [{friendId, pseudo, photo}]
let fcActiveFriendId = null;
let fcMessages = [];
let fcChannel = null;
let fcActivityMap = {}; // friendId -> dernier created_at (tri de la liste)
let fcLastMsgMap = {}; // friendId -> dernier message échangé (aperçu + heure dans la liste)
let fcUnreadCounts = {}; // friendId -> nombre de messages non lus de cet ami
let fcInitDone = false;
let fcSetupNoticeShown = false;
let fcSearchDebounce = null;
let fcAudioPlayingId = null;
let fcReactionsMap = {}; // messageId -> [{user_id, emoji}]
let fcReactPickerTargetId = null;
let fcRecentEmojis = FC_REACT_EMOJIS.slice();
let fcResizeHandlersBound = false;

// ── Utilitaires ──
function fcEsc(s) {
  return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s);
}
function fcFmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function fcFmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}
function fcAvatarHtml(photoUrl, pseudo) {
  const initial = fcEsc((pseudo || '?').trim().charAt(0).toUpperCase() || '?');
  if (photoUrl) {
    return `<div class="fc-avatar"><img src="${fcEsc(photoUrl)}" alt=""></div>`;
  }
  return `<div class="fc-avatar">${initial}</div>`;
}
function fcIsMissingTableError(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') return true;
  const msg = (
    (error.message || '') +
    ' ' +
    (error.hint || '') +
    ' ' +
    (error.details || '')
  ).toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache')
  );
}
function fcShowSetupNotice() {
  if (fcSetupNoticeShown) return;
  fcSetupNoticeShown = true;
  const wrap = document.getElementById('fcWrap');
  if (wrap) {
    wrap.innerHTML =
      '<div class="fc-setup-notice">⚠ La messagerie n\'est pas encore configurée côté Supabase.<br>' +
      'Exécute la migration SQL fournie (tables tjp_profiles / tjp_contacts / tjp_messages + bucket ' +
      'chat-audio), puis recharge la page.</div>';
  }
}

// ══ CSS injecté (aucune modification de style.css) ══
const FC_CSS = `
.fc-wrap{display:flex;height:clamp(420px,calc(100vh - 190px),760px);border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--card);}
.fc-sidebar{width:280px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--fc-sidebar-bg,var(--surface));}
.fc-sidebar-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0;}
.fc-sidebar-title{font-family:var(--mono);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
.fc-add-btn{width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:var(--card);color:var(--fc-add-btn-color,var(--green));font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.fc-add-btn:hover{border-color:var(--fc-add-btn-color,var(--green));}
.fc-contact-list{flex:1;overflow-y:auto;}
.fc-contact-empty{padding:24px 14px;font-size:12px;color:var(--muted);text-align:center;line-height:1.6;}
.fc-contact-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s;}
.fc-contact-item:hover{background:rgba(255,255,255,.04);}
.fc-contact-item.active{background:var(--fc-contact-active-bg,color-mix(in srgb, var(--green) 10%, transparent));}
.fc-avatar{width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);font-size:15px;color:var(--muted);font-family:var(--mono);}
.fc-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.fc-contact-name{font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.fc-contact-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.fc-contact-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;}
.fc-contact-time{font-family:var(--mono);font-size:10px;color:var(--muted);flex-shrink:0;white-space:nowrap;}
.fc-contact-last{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fc-contact-last.fc-none{font-style:italic;opacity:.7;}
.fc-contact-avatar-wrap{position:relative;flex-shrink:0;}
.fc-contact-unread-dot{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--fc-unread-dot-color,var(--red));border:2px solid var(--fc-sidebar-bg,var(--surface));}
.fc-nav-badge{display:none;position:absolute;top:4px;right:2px;width:8px;height:8px;border-radius:50%;background:var(--fc-unread-dot-color,var(--red));box-shadow:0 0 0 2px var(--nav-bg,var(--bg));}
.fc-burger-badge{top:-4px;right:-4px;}
.fc-burger-badge.fc-badge-count{top:-7px;right:-7px;}
#mobileMenu .fc-nav-badge{top:5px;right:auto;left:5px;}
.fc-contact-unread-dot.fc-badge-count,.fc-nav-badge.fc-badge-count{width:auto;min-width:15px;height:15px;padding:0 3px;align-items:center;justify-content:center;color:var(--fc-unread-text-color,#fff);font-size:9px;font-family:var(--mono);line-height:1;}
.fc-chat{flex:1;display:flex;flex-direction:column;min-width:0;}
.fc-chat-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;padding:20px;text-align:center;}
.fc-chat-active{flex:1;display:flex;flex-direction:column;min-height:0;}
.fc-chat-header{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.fc-chat-header .fc-avatar{width:32px;height:32px;font-size:12px;}
.fc-back-btn{display:none;background:none;border:none;color:var(--text);font-size:19px;cursor:pointer;padding:2px 6px 2px 0;line-height:1;}
.fc-chat-pseudo{font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fc-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;}
.fc-msg-row{display:flex;}
.fc-msg-row.mine{justify-content:flex-end;}
.fc-msg-inner{display:flex;align-items:center;gap:3px;max-width:72%;min-width:0;}
.fc-bubble-wrap{position:relative;min-width:0;}
.fc-bubble{padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.4;}
.fc-msg-row.mine .fc-bubble{background:var(--fc-bubble-mine-bg,color-mix(in srgb, var(--green) 20%, var(--card)));border-bottom-right-radius:3px;}
.fc-msg-row:not(.mine) .fc-bubble{background:var(--fc-bubble-theirs-bg,var(--surface));border:1px solid var(--fc-bubble-theirs-border,var(--border));border-bottom-left-radius:3px;}
.fc-bubble-text{white-space:pre-wrap;word-break:break-word;color:var(--fc-bubble-text,var(--text));}
.fc-bubble-time{font-size:9px;color:var(--fc-time-color,var(--muted));margin-top:3px;text-align:right;font-family:var(--mono);}
.fc-react-trigger{opacity:0;transition:opacity .15s;flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--fc-react-trigger-bg,var(--surface));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;position:relative;color:var(--muted);padding:0;}
.fc-msg-inner:hover .fc-react-trigger,.fc-msg-row.show-react .fc-react-trigger{opacity:1;}
.fc-react-face{filter:grayscale(1);opacity:.85;}
.fc-react-plus{position:absolute;bottom:-2px;right:-2px;background:var(--card);border-radius:50%;font-size:8px;line-height:1;width:11px;height:11px;display:flex;align-items:center;justify-content:center;color:var(--text);border:1px solid var(--border);}
.fc-react-badges{position:absolute;bottom:-9px;display:flex;gap:2px;background:var(--fc-react-badge-bg,var(--card));border:1px solid var(--border);border-radius:9px;padding:1px 4px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.35);}
.fc-msg-row.mine .fc-react-badges{right:8px;}
.fc-msg-row:not(.mine) .fc-react-badges{left:8px;}
.fc-react-picker{position:fixed;display:none;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:5000;}
.fc-react-quick{display:flex;gap:4px;align-items:center;}
.fc-react-opt{font-size:20px;cursor:pointer;transition:transform .1s;line-height:1;padding:2px;}
.fc-react-opt:hover{transform:scale(1.25);}
.fc-react-more-btn{width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:2px;}
.fc-react-more-btn:hover{color:var(--green);border-color:var(--green);}
.fc-react-full{display:none;flex-direction:column;width:300px;max-width:80vw;}
.fc-react-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px;}
.fc-react-tab{font-size:17px;padding:3px 6px;border-radius:6px;cursor:pointer;flex-shrink:0;opacity:.55;}
.fc-react-tab.active{opacity:1;background:var(--surface);}
.fc-react-grid-scroll{max-height:230px;overflow-y:auto;position:relative;}
.fc-react-cat-section{margin-bottom:2px;}
.fc-react-cat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:5px 2px 3px;position:sticky;top:0;background:var(--card);z-index:1;}
.fc-react-cat-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;}
.fc-react-grid-emoji{font-size:19px;text-align:center;cursor:pointer;padding:3px 0;border-radius:5px;line-height:1.3;}
.fc-react-grid-emoji:hover{background:var(--surface);}
.fc-audio-msg{display:flex;align-items:center;gap:8px;min-width:236px;}
.fc-audio-avatar{width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--surface);border:1px solid var(--border);}
.fc-audio-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.fc-audio-play{width:28px;height:28px;border-radius:50%;border:none;background:var(--fc-audio-play-bg,var(--green));color:var(--bg);font-size:11px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.fc-audio-bar{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden;}
.fc-audio-bar-fill{height:100%;background:var(--fc-audio-fill-color,var(--green));width:0%;}
.fc-audio-duration{font-size:10px;color:var(--muted);font-family:var(--mono);flex-shrink:0;}
.fc-bt-badge{font-size:11px;line-height:1;padding:1px 3px;background:var(--bt-bg);color:var(--bt-tx);border-radius:3px;font-family:var(--mono);display:inline-block;}
.fc-trade-card{width:220px;max-width:100%;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--card);}
.fc-trade-card-head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px;background:var(--fc-trade-head-bg,var(--surface));font-family:var(--mono);font-size:11px;color:var(--text);}
.fc-trade-card-head.fc-has-img{cursor:zoom-in;}
.fc-trade-card-head.fc-has-img:hover{filter:brightness(1.25);}
.fc-trade-card-body{padding:8px 10px;font-size:11px;color:var(--text);}
.fc-trade-row{display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;}
.fc-trade-row span:first-child{color:var(--muted);}
.fc-trade-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;}
.fc-trade-chip{font-size:9px;padding:2px 6px;border-radius:3px;background:var(--fc-trade-chip-bg,var(--surface));border:1px solid var(--border);color:var(--muted);}
.fc-trade-notes{margin-top:6px;font-size:10px;color:var(--muted);font-style:italic;white-space:pre-wrap;}
.fc-trade-imgs{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;}
.fc-trade-imgs img{width:44px;height:34px;object-fit:cover;border-radius:4px;cursor:zoom-in;border:1px solid var(--border);}
/* Zone de la fiche de trade partagée +50% par rapport à la largeur de base
   (220px → 330px) sur les 3 modes PC (normal, vertical, ultrawide) — le
   contenu à l'intérieur (texte, badges, chips, notes, images) reste à sa
   taille normale, seule la boîte est agrandie (18/09/2026, demande de Paul
   — annule le 2x du 16-17/09 qui avait aussi doublé le contenu par
   erreur). Pas de changement en téléphone. */
body.cf-mode-normal .fc-trade-card,
body.cf-mode-vertical .fc-trade-card,
body.cf-mode-ultrawide .fc-trade-card{width:330px;}
.fc-input-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.fc-attach-btn,.fc-mic-btn,.fc-cancel-btn{background:none;border:none;color:var(--fc-icon-color,var(--muted));font-size:19px;cursor:pointer;flex-shrink:0;padding:4px;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none;}
.fc-attach-btn:hover,.fc-mic-btn:hover{color:var(--fc-send-color,var(--green));}
.fc-cancel-btn{display:none;color:var(--fc-cancel-color,var(--red));transition:transform .12s,background .12s,color .12s;border-radius:50%;align-self:center;}
.fc-cancel-btn:hover{opacity:.8;}
.fc-cancel-btn.armed{color:#fff;background:var(--fc-cancel-color,var(--red));transform:scale(1.3);}
.fc-mic-btn[data-mode="send"]{color:var(--fc-send-color,var(--green));}
.fc-input-center{flex:1;min-width:0;position:relative;display:flex;align-items:center;}
.fc-rec-indicator{display:none;align-items:center;gap:8px;width:100%;background:transparent;border:none;padding:8px 2px;box-sizing:border-box;}
.fc-rec-wave{flex:1;display:flex;align-items:center;gap:2px;height:22px;overflow:hidden;}
.fc-wave-bar{flex:0 0 3px;width:3px;background:var(--fc-wave-color,var(--green));border-radius:2px;height:15%;transition:height .08s linear;}
.fc-mic-wrap{position:relative;flex-shrink:0;align-self:center;}
.fc-rec-dot{width:9px;height:9px;border-radius:50%;background:var(--fc-rec-dot-color,var(--red));animation:fcPulse 1s infinite;flex-shrink:0;}
.fc-rec-timer{font-family:var(--mono);font-size:12px;color:var(--text);flex-shrink:0;}
.fc-text-input{flex:1;resize:none;max-height:96px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:8px 12px;color:var(--text);font-family:var(--sans);font-size:13px;line-height:1.35;}
.fc-text-input:focus{outline:none;border-color:var(--green);}
@keyframes fcPulse{0%,100%{opacity:1}50%{opacity:.3}}
.fc-setup-notice{padding:24px;font-size:12px;color:var(--muted);line-height:1.7;text-align:center;margin:auto;}
.fc-modal-box{width:340px;max-width:92vw;text-align:left;max-height:80vh;display:flex;flex-direction:column;}
.fc-modal-title{font-family:var(--mono);font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:12px;text-align:center;}
.fc-search-input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px;margin-bottom:10px;font-family:var(--sans);}
.fc-search-input:focus{outline:none;border-color:var(--green);}
.fc-search-results,.fc-trade-pick-list{flex:1;overflow-y:auto;max-height:320px;}
.fc-result-item{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:6px;}
.fc-result-name{font-size:13px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fc-result-add-btn{font-family:var(--mono);font-size:9px;padding:5px 10px;border-radius:4px;background:var(--btn-p-bg);color:var(--btn-p-tx);border:none;cursor:pointer;flex-shrink:0;}
.fc-trade-pick-item{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:6px;cursor:pointer;}
.fc-trade-pick-item:hover{background:rgba(255,255,255,.05);}
.fc-trade-pick-info{flex:1;min-width:0;}
.fc-trade-pick-pair{font-size:12px;color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fc-trade-pick-meta{font-size:10px;color:var(--muted);}
.fc-empty-hint{font-size:11px;color:var(--muted);text-align:center;padding:14px 6px;}
@media (max-width:1100px){
  .fc-wrap{height:calc(100dvh - 150px);min-height:280px;border-radius:6px;}
  .fc-sidebar{width:100%;border-right:none;}
  .fc-chat{display:none;}
  .fc-wrap.fc-chat-open .fc-sidebar{display:none;}
  .fc-wrap.fc-chat-open .fc-chat{display:flex;}
  .fc-back-btn{display:inline-flex;}
  .fc-contact-item{gap:14px;}
  .fc-avatar{width:56px;height:56px;font-size:19px;margin:0 auto;}
  .fc-contact-avatar-wrap .fc-avatar{margin:0;}
  .fc-msg-inner{max-width:82%;}
}
/* ── Liste des amis (tous les modes) : une colonne, photo à gauche, pseudo + heure et dernier message à droite,
   toute la ligne cliquable / surlignée. Photos ×2 en modes PC (normal, ultra wide, vertical) ; en mode
   Téléphone elles gardent leur taille d'origine (56 px). ── */
body:not(.cf-mode-phone) .fc-contact-item{gap:14px;}
body:not(.cf-mode-phone) .fc-contact-avatar-wrap .fc-avatar{width:80px;height:80px;font-size:30px;margin:0;}
@media (max-width:1100px){
  body:not(.cf-mode-phone) .fc-contact-item{gap:18px;padding:12px 16px;}
  body:not(.cf-mode-phone) .fc-contact-avatar-wrap .fc-avatar{width:112px;height:112px;font-size:38px;}
  body:not(.cf-mode-phone) .fc-contact-last{font-size:13px;}
}
@media (min-width:1101px){
  body:not(.cf-mode-phone) .fc-sidebar{width:340px;}
}
.fc-bubble-deleted{color:var(--muted);font-style:italic;}
.fc-bubble-edited{font-size:9px;color:var(--muted);margin-left:5px;}
.fc-msg-menu{position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;z-index:4200;min-width:190px;box-shadow:0 6px 18px rgba(0,0,0,.35);overflow:hidden;}
.fc-msg-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:var(--text);font-family:var(--mono);font-size:11px;padding:10px 14px;cursor:pointer;}
.fc-msg-menu button:hover{background:var(--hover,rgba(255,255,255,.06));}
.fc-msg-menu button.fc-msg-menu-danger{color:#ef4444;}
.fc-edit-modal-box{width:408px;}
.fc-edit-textarea{width:100%;min-height:90px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:13px;padding:10px;resize:vertical;box-sizing:border-box;}
`;

function fcInjectStyles() {
  if (document.getElementById('fcStyles')) return;
  const style = document.createElement('style');
  style.id = 'fcStyles';
  style.textContent = FC_CSS;
  document.head.appendChild(style);
}

// ══ Markup ══
const FC_HTML = `
<div class="fc-wrap" id="fcWrap">
  <div class="fc-sidebar">
    <div class="fc-sidebar-header">
      <span class="fc-sidebar-title">Discussions</span>
      <button class="fc-add-btn" onclick="fcOpenAddContact()" title="Ajouter un ami">+</button>
    </div>
    <div class="fc-contact-list" id="fcContactList"><div class="fc-contact-empty">Chargement…</div></div>
  </div>
  <div class="fc-chat">
    <div class="fc-chat-empty" id="fcChatEmpty">Sélectionne un ami pour discuter.</div>
    <div class="fc-chat-active" id="fcChatActive" style="display:none;">
      <div class="fc-chat-header">
        <button class="fc-back-btn" onclick="fcBackToContacts()">←</button>
        <div id="fcChatAvatar"></div>
        <div class="fc-chat-pseudo" id="fcChatPseudo"></div>
      </div>
      <div class="fc-messages" id="fcMessages"></div>
      <div class="fc-input-bar" id="fcInputBarRow">
        <button class="fc-cancel-btn" id="fcCancelBtn" title="Annuler">${FC_ICON_TRASH}</button>
        <button class="fc-attach-btn" id="fcAttachBtn" title="Partager un trade">${FC_ICON_ATTACH}</button>
        <div class="fc-input-center">
          <textarea class="fc-text-input" id="fcTextInput" placeholder="Message" rows="1"></textarea>
          <div class="fc-rec-indicator" id="fcRecIndicator" style="display:none;">
            <span class="fc-rec-dot"></span>
            <span class="fc-rec-timer" id="fcRecTimer">0:00</span>
            <div class="fc-rec-wave" id="fcRecWave"></div>
          </div>
        </div>
        <div class="fc-mic-wrap" id="fcMicWrap">
          <button class="fc-mic-btn" id="fcMicBtn" title="Message vocal (rester appuyé)">${FC_ICON_MIC}</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

const FC_MODALS_HTML = `
<div class="confirm-modal" id="fcAddModal">
  <div class="confirm-box fc-modal-box">
    <div class="fc-modal-title">Ajouter un ami</div>
    <input type="text" class="fc-search-input" id="fcPseudoSearchInput" placeholder="Pseudo…" oninput="fcOnPseudoSearchInput()">
    <div class="fc-search-results" id="fcSearchResults"></div>
    <div class="btn-row" style="margin-top:12px;"><button class="btn btn-g" onclick="fcCloseAddContact()">FERMER</button></div>
  </div>
</div>
<div class="confirm-modal" id="fcEditMsgModal">
  <div class="confirm-box fc-modal-box fc-edit-modal-box">
    <div class="fc-modal-title">Modifier le message</div>
    <textarea class="fc-edit-textarea" id="fcEditMsgInput" rows="4"></textarea>
    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-g" onclick="fcCloseEditModal()">ANNULER</button>
      <button class="btn btn-p" onclick="fcSaveEditedMessage()">ENREGISTRER</button>
    </div>
  </div>
</div>
<div class="confirm-modal" id="fcTradeModal">
  <div class="confirm-box fc-modal-box">
    <div class="fc-modal-title">Partager un trade</div>
    <input type="text" class="fc-search-input" id="fcTradeSearchInput" placeholder="Rechercher une paire, une date…" oninput="fcRenderTradePickerList(this.value)">
    <div class="fc-trade-pick-list" id="fcTradePickList"></div>
    <div class="btn-row" style="margin-top:12px;"><button class="btn btn-g" onclick="fcCloseTradePicker()">FERMER</button></div>
  </div>
</div>
`;

function fcInjectMarkup() {
  const page = document.getElementById('page-ami');
  if (!page || document.getElementById('fcWrap')) return;
  page.insertAdjacentHTML('beforeend', FC_HTML);
  fcBindInputBarEvents();
}
function fcInjectModals() {
  if (document.getElementById('fcAddModal')) return;
  document.body.insertAdjacentHTML('beforeend', FC_MODALS_HTML);
}

// ══ Profil publié dans l'annuaire (pour la recherche par pseudo) ══
async function fcPublishProfile() {
  if (!currentUser || typeof sb === 'undefined') return;
  try {
    const profile = typeof getProfile === 'function' ? getProfile() : null;
    if (!profile) return;
    await sb.from(FC_PROFILES_TABLE).upsert(
      {
        user_id: currentUser.id,
        pseudo: profile.pseudo || 'Trader',
        photo_url: profile.photo || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } catch (e) {
    console.warn('fcPublishProfile:', e);
  }
}

// ══ Contacts ══
async function fcLoadContacts() {
  if (!currentUser || typeof sb === 'undefined') return;
  const me = currentUser.id;
  try {
    const { data, error } = await sb
      .from(FC_CONTACTS_TABLE)
      .select('user_id,contact_user_id')
      .or(`user_id.eq.${me},contact_user_id.eq.${me}`);
    if (error) {
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      return;
    }
    const friendIds = Array.from(
      new Set((data || []).map((r) => (r.user_id === me ? r.contact_user_id : r.user_id))),
    );
    if (!friendIds.length) {
      fcContacts = [];
      fcRenderContactList();
      return;
    }
    const { data: profiles, error: perr } = await sb
      .from(FC_PROFILES_TABLE)
      .select('user_id,pseudo,photo_url')
      .in('user_id', friendIds);
    if (perr && fcIsMissingTableError(perr)) fcShowSetupNotice();
    const profMap = {};
    (profiles || []).forEach((p) => {
      profMap[p.user_id] = p;
    });
    fcContacts = friendIds.map((id) => ({
      friendId: id,
      pseudo: (profMap[id] && profMap[id].pseudo) || 'Utilisateur',
      photo: (profMap[id] && profMap[id].photo_url) || '',
    }));
    await fcRefreshActivityOrder();
  } catch (e) {
    console.warn('fcLoadContacts:', e);
  }
}

function fcLastReadKey(friendId) {
  return 'tjp_chat_lastread__' + (currentUser ? currentUser.id : '?') + '__' + friendId;
}
function fcGetLastRead(friendId) {
  try {
    return localStorage.getItem(fcLastReadKey(friendId));
  } catch (e) {
    return null;
  }
}
function fcSetLastRead(friendId, iso) {
  try {
    localStorage.setItem(fcLastReadKey(friendId), iso);
  } catch (e) {}
}
function fcMarkRead(friendId) {
  const iso = new Date().toISOString();
  fcApplyReadLocally(friendId, iso);
  fcPushReadState(friendId, iso);
}
// Applique un "lu" déjà connu (venant de nous-même ou d'un autre de nos
// appareils via le temps réel) à l'état local, sans re-déclencher de push.
function fcApplyReadLocally(friendId, iso) {
  fcSetLastRead(friendId, iso);
  if (fcUnreadCounts[friendId]) {
    delete fcUnreadCounts[friendId];
    fcRenderContactList();
  }
  fcUpdateNavBadge();
}
// Publie ce "lu" vers le cloud pour que les autres appareils du même compte
// fassent disparaître la notification en direct (voir fcStartRealtime).
function fcPushReadState(friendId, iso) {
  if (!currentUser || typeof sb === 'undefined') return;
  sb.from(FC_READS_TABLE)
    .upsert({user_id: currentUser.id, friend_id: friendId, last_read: iso}, {onConflict: 'user_id,friend_id'})
    .then(({error}) => {
      if (error && !fcIsMissingTableError(error)) console.warn('fcPushReadState:', error);
    });
}
// Récupère au démarrage les "lu" déjà enregistrés dans le cloud (ex: lus sur
// un autre appareil pendant que celui-ci était fermé) et les fusionne dans le
// localStorage local avant le premier calcul des notifications non lues.
async function fcSyncReadStateFromCloud() {
  if (!currentUser || typeof sb === 'undefined') return;
  try {
    const {data, error} = await sb
      .from(FC_READS_TABLE)
      .select('friend_id,last_read')
      .eq('user_id', currentUser.id);
    if (error) return; // table pas encore migrée : on reste sur le comportement local existant
    (data || []).forEach((r) => {
      const local = fcGetLastRead(r.friend_id);
      if (!local || r.last_read > local) fcSetLastRead(r.friend_id, r.last_read);
    });
  } catch (e) {}
}
// Un "lu" arrivé en direct depuis un autre de nos appareils (temps réel).
function fcHandleRemoteRead(row) {
  if (!row || !row.friend_id || !row.last_read) return;
  const local = fcGetLastRead(row.friend_id);
  if (local && row.last_read <= local) return; // déjà à jour ou plus récent localement
  fcApplyReadLocally(row.friend_id, row.last_read);
}

// ===== Notifications push (icône hors app) =====================

// Nécessaire pour transmettre la clé VAPID (format base64url) à
// pushManager.subscribe(), qui attend un Uint8Array.
function fcUrlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
async function fcRegisterServiceWorker() {
  if (!FC_PUSH_SUPPORTED) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
  } catch (e) {
    console.warn('fcRegisterServiceWorker:', e);
    return null;
  }
}
// 'unsupported' | 'denied' | 'inactive' | 'active'
async function fcPushSubscriptionState() {
  if (!FC_PUSH_SUPPORTED) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'inactive';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'active' : 'inactive';
}
async function fcEnablePush() {
  if (!FC_PUSH_SUPPORTED) {
    alert("Les notifications ne sont pas prises en charge sur cet appareil ou ce navigateur.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    fcRenderPushButton();
    return;
  }
  const reg = await fcRegisterServiceWorker();
  if (!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fcUrlB64ToUint8Array(FC_VAPID_PUBLIC_KEY),
      });
    } catch (e) {
      console.warn('fcEnablePush subscribe:', e);
      fcRenderPushButton();
      return;
    }
  }
  await fcSavePushSubscription(sub);
  fcRenderPushButton();
}
async function fcDisablePush() {
  if (!FC_PUSH_SUPPORTED) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fcDeletePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
  fcRenderPushButton();
}
async function fcTogglePush() {
  const state = await fcPushSubscriptionState();
  if (state === 'active') fcDisablePush();
  else fcEnablePush();
}
// Demande la permission notifications sur le tout premier tap après connexion,
// au lieu d'attendre que la personne aille chercher le bouton dans Profil.
// Obligatoire techniquement : un navigateur refuse d'afficher ce prompt en
// dehors d'un vrai geste utilisateur (clic/tap), impossible de le déclencher
// tout seul sans interaction.
function fcArmAutoPushPrompt() {
  if (!FC_PUSH_SUPPORTED) return;
  document.addEventListener('click', fcEnablePush, {once: true, capture: true});
}
async function fcSavePushSubscription(sub) {
  if (!currentUser || typeof sb === 'undefined') return;
  const json = sub.toJSON();
  const {error} = await sb
    .from(FC_PUSH_TABLE)
    .upsert(
      {endpoint: sub.endpoint, user_id: currentUser.id, p256dh: json.keys.p256dh, auth: json.keys.auth},
      {onConflict: 'endpoint'},
    );
  if (error && !fcIsMissingTableError(error)) console.warn('fcSavePushSubscription:', error);
}
async function fcDeletePushSubscription(endpoint) {
  if (!currentUser || typeof sb === 'undefined') return;
  const {error} = await sb.from(FC_PUSH_TABLE).delete().eq('endpoint', endpoint);
  if (error && !fcIsMissingTableError(error)) console.warn('fcDeletePushSubscription:', error);
}
async function fcRenderPushButton() {
  const btn = document.getElementById('fcPushBtn');
  if (!btn) return;
  const state = await fcPushSubscriptionState();
  btn.disabled = false;
  if (state === 'unsupported') {
    btn.textContent = 'Notifications non disponibles sur cet appareil';
    btn.disabled = true;
  } else if (state === 'denied') {
    btn.textContent = 'Notifications bloquées (à autoriser dans les réglages du navigateur)';
    btn.disabled = true;
  } else if (state === 'active') {
    btn.textContent = 'Notifications activées';
  } else {
    btn.textContent = 'Activer les notifications';
  }
}

function fcInjectNavBadges() {
  // Menu burger (onglets masqués) : un point rouge en haut à droite du bouton ☰,
  // pour voir qu'un message est arrivé sans ouvrir le menu.
  document.querySelectorAll('.hamburger').forEach((hb) => {
    if (hb.querySelector('.fc-nav-badge')) return;
    hb.style.position = 'relative';
    const dot = document.createElement('span');
    dot.className = 'fc-nav-badge fc-burger-badge';
    hb.appendChild(dot);
  });
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    const oc = btn.getAttribute('onclick') || '';
    if (oc.indexOf("showPage('ami'") === -1 || btn.querySelector('.fc-nav-badge')) return;
    btn.style.position = 'relative';
    const dot = document.createElement('span');
    dot.className = 'fc-nav-badge';
    btn.appendChild(dot);
  });
}
function fcUpdateNavBadge() {
  // Réinjecte le point s'il a disparu (ex: bouton d'onglet re-rendu entre-
  // temps) avant de basculer sa visibilité — sinon la notification ne
  // remonte qu'au rechargement de la page au lieu d'apparaître en direct.
  fcInjectNavBadges();
  const total = Object.values(fcUnreadCounts).reduce((s, n) => s + n, 0);
  document.querySelectorAll('.fc-nav-badge').forEach((dot) => {
    if (total <= 0) {
      dot.style.display = 'none';
      dot.classList.remove('fc-badge-count');
      dot.textContent = '';
    } else if (total === 1) {
      dot.classList.remove('fc-badge-count');
      dot.textContent = '';
      dot.style.display = 'block';
    } else {
      dot.classList.add('fc-badge-count');
      dot.textContent = total > 99 ? '99+' : String(total);
      dot.style.display = 'flex';
    }
  });
  // Badge natif de l'icône (écran d'accueil / barre des tâches / dock) —
  // volontairement sans chiffre : l'API ne permet de toute façon pas de le
  // colorer, et Paul a choisi le point simple plutôt qu'un nombre ici.
  if (navigator && 'setAppBadge' in navigator) {
    if (total > 0) navigator.setAppBadge().catch(() => {});
    else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }
}

async function fcRefreshActivityOrder() {
  if (!currentUser || typeof sb === 'undefined') {
    fcRenderContactList();
    return;
  }
  const me = currentUser.id;
  try {
    const { data, error } = await sb
      .from(FC_MESSAGES_TABLE)
      .select('id,sender_id,receiver_id,created_at,msg_type,content,audio_duration,deleted')
      .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(400);
    if (!error && data) {
      fcActivityMap = {};
      fcLastMsgMap = {};
      const incomingByFriend = {};
      data.forEach((m) => {
        const other = m.sender_id === me ? m.receiver_id : m.sender_id;
        if (!fcActivityMap[other]) fcActivityMap[other] = m.created_at;
        if (!fcLastMsgMap[other]) fcLastMsgMap[other] = m; // le plus récent (liste triée du plus récent au plus ancien)
        if (m.sender_id === other) {
          if (!incomingByFriend[other]) incomingByFriend[other] = [];
          incomingByFriend[other].push(m.created_at);
        }
      });
      fcUnreadCounts = {};
      Object.keys(incomingByFriend).forEach((fid) => {
        if (fid === fcActiveFriendId) return; // conversation ouverte : jamais "non lu"
        const lastRead = fcGetLastRead(fid);
        const count = incomingByFriend[fid].filter((ts) => !lastRead || ts > lastRead).length;
        if (count > 0) fcUnreadCounts[fid] = count;
      });
      fcUpdateNavBadge();
    }
  } catch (e) {}
  fcContacts.sort((a, b) => {
    const ta = fcActivityMap[a.friendId];
    const tb = fcActivityMap[b.friendId];
    if (ta && tb) return tb.localeCompare(ta);
    if (ta) return -1;
    if (tb) return 1;
    return a.pseudo.localeCompare(b.pseudo);
  });
  fcRenderContactList();
}

// Aperçu du dernier message : « Vous : » devant un message envoyé par moi.
function fcPreviewText(m) {
  if (!m) return '';
  let t;
  if (m.deleted) t = 'Message supprimé';
  else if (m.msg_type === 'audio') t = 'Message vocal' + (m.audio_duration ? ' (' + fcFmtDuration(m.audio_duration) + ')' : '');
  else if (m.msg_type === 'trade') t = 'Trade partagé';
  else t = String(m.content || '').replace(/\s+/g, ' ').trim();
  const mine = currentUser && m.sender_id === currentUser.id;
  return (mine ? 'Vous : ' : '') + t;
}
// Heure du dernier message : « 14:32 » aujourd'hui, « Hier 14:32 » hier, sinon « 12/09 14:32 »
// (avec l'année si ce n'est pas l'année en cours).
function fcFmtListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5,
  );
  if (dayDiff === 0) return hm;
  if (dayDiff === 1) return 'Hier ' + hm;
  const dm = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  return (d.getFullYear() === now.getFullYear() ? dm : dm + '/' + String(d.getFullYear()).slice(2)) + ' ' + hm;
}
// Un message modifié / supprimé (par moi ou par l'autre) : met à jour l'aperçu s'il s'agit du dernier.
function fcSyncLastMsg(m) {
  if (!m || !currentUser) return;
  const other = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
  const cur = fcLastMsgMap[other];
  if (cur && cur.id === m.id) {
    fcLastMsgMap[other] = Object.assign({}, cur, m);
    fcRenderContactList();
  }
}

function fcRenderContactList() {
  const list = document.getElementById('fcContactList');
  if (!list) return;
  if (!fcContacts.length) {
    list.innerHTML =
      '<div class="fc-contact-empty">Aucun ami pour le moment.<br>Touche + pour en ajouter un par son pseudo.</div>';
    return;
  }
  list.innerHTML = fcContacts
    .map((c) => {
      const unreadCount = fcUnreadCounts[c.friendId] || 0;
      const unreadDot =
        unreadCount === 1
          ? '<span class="fc-contact-unread-dot"></span>'
          : unreadCount > 1
            ? `<span class="fc-contact-unread-dot fc-badge-count">${unreadCount > 99 ? '99+' : unreadCount}</span>`
            : '';
      const last = fcLastMsgMap[c.friendId];
      const lastHtml = last
        ? `<div class="fc-contact-last">${fcEsc(fcPreviewText(last))}</div>`
        : '<div class="fc-contact-last fc-none">Aucun message</div>';
      const timeHtml = last ? `<span class="fc-contact-time">${fcEsc(fcFmtListTime(last.created_at))}</span>` : '';
      return `<div class="fc-contact-item${c.friendId === fcActiveFriendId ? ' active' : ''}" data-friend-id="${fcEsc(c.friendId)}" onclick="fcOpenConversation(this.dataset.friendId)">
      <div class="fc-contact-avatar-wrap">
        ${fcAvatarHtml(c.photo, c.pseudo)}
        ${unreadDot}
      </div>
      <div class="fc-contact-body">
        <div class="fc-contact-top"><div class="fc-contact-name">${fcEsc(c.pseudo)}</div>${timeHtml}</div>
        ${lastHtml}
      </div>
    </div>`;
    })
    .join('');
}

// ── Ajout d'un ami par pseudo ──
function fcOpenAddContact() {
  const modal = document.getElementById('fcAddModal');
  if (modal) modal.classList.add('open');
  const input = document.getElementById('fcPseudoSearchInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  const results = document.getElementById('fcSearchResults');
  if (results) results.innerHTML = '';
}
function fcCloseAddContact() {
  const modal = document.getElementById('fcAddModal');
  if (modal) modal.classList.remove('open');
}
function fcOnPseudoSearchInput() {
  clearTimeout(fcSearchDebounce);
  fcSearchDebounce = setTimeout(fcRunPseudoSearch, 300);
}
async function fcRunPseudoSearch() {
  const input = document.getElementById('fcPseudoSearchInput');
  const results = document.getElementById('fcSearchResults');
  if (!input || !results || typeof sb === 'undefined') return;
  const q = input.value.trim().replace(/[%_]/g, '');
  if (!q) {
    results.innerHTML = '';
    return;
  }
  results.innerHTML = '<div class="fc-empty-hint">Recherche…</div>';
  try {
    const { data, error } = await sb
      .from(FC_PROFILES_TABLE)
      .select('user_id,pseudo,photo_url')
      .ilike('pseudo', `%${q}%`)
      .limit(10);
    if (error) {
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      else results.innerHTML = '<div class="fc-empty-hint">Erreur de recherche.</div>';
      return;
    }
    const me = currentUser.id;
    const existingIds = new Set(fcContacts.map((c) => c.friendId));
    const filtered = (data || []).filter((p) => p.user_id !== me);
    if (!filtered.length) {
      results.innerHTML = '<div class="fc-empty-hint">Aucun pseudo correspondant.</div>';
      return;
    }
    results.innerHTML = filtered
      .map(
        (p) => `<div class="fc-result-item">
        ${fcAvatarHtml(p.photo_url, p.pseudo)}
        <div class="fc-result-name">${fcEsc(p.pseudo)}</div>
        ${
          existingIds.has(p.user_id)
            ? '<span style="font-size:9px;color:var(--muted);font-family:var(--mono);flex-shrink:0;">DÉJÀ AJOUTÉ</span>'
            : `<button class="fc-result-add-btn" data-user-id="${fcEsc(p.user_id)}" onclick="fcAddContact(this.dataset.userId)">AJOUTER</button>`
        }
      </div>`,
      )
      .join('');
  } catch (e) {
    console.warn('fcRunPseudoSearch:', e);
  }
}
async function fcAddContact(friendUserId) {
  if (!currentUser || typeof sb === 'undefined') return;
  try {
    const { error } = await sb
      .from(FC_CONTACTS_TABLE)
      .insert({ user_id: currentUser.id, contact_user_id: friendUserId });
    if (error && error.code !== '23505') {
      // 23505 = unique_violation (déjà ami) : pas grave, on continue
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      else if (typeof showSync === 'function') showSync('⚠ Ajout impossible', '#ef4444');
      return;
    }
    fcCloseAddContact();
    await fcLoadContacts();
  } catch (e) {
    console.warn('fcAddContact:', e);
  }
}

// ══ Conversation ══
async function fcOpenConversation(friendId) {
  fcActiveFriendId = friendId;
  const c = fcContacts.find((x) => x.friendId === friendId);
  const emptyEl = document.getElementById('fcChatEmpty');
  const activeEl = document.getElementById('fcChatActive');
  if (emptyEl) emptyEl.style.display = 'none';
  if (activeEl) activeEl.style.display = 'flex';
  const pseudoEl = document.getElementById('fcChatPseudo');
  if (pseudoEl) pseudoEl.textContent = c ? c.pseudo : '…';
  const avatarEl = document.getElementById('fcChatAvatar');
  if (avatarEl) avatarEl.innerHTML = fcAvatarHtml(c ? c.photo : '', c ? c.pseudo : '?');
  document.querySelectorAll('.fc-contact-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.friendId === friendId);
  });
  const wrap = document.getElementById('fcWrap');
  if (wrap) wrap.classList.add('fc-chat-open');
  const input = document.getElementById('fcTextInput');
  if (input) input.value = '';
  fcUpdateMicSendBtn();
  fcMarkRead(friendId);
  await fcLoadMessages(friendId);
}
function fcBackToContacts() {
  const wrap = document.getElementById('fcWrap');
  if (wrap) wrap.classList.remove('fc-chat-open');
}
async function fcLoadMessages(friendId) {
  const box = document.getElementById('fcMessages');
  if (box) box.innerHTML = '<div class="fc-empty-hint">Chargement…</div>';
  if (!currentUser || typeof sb === 'undefined') return;
  const me = currentUser.id;
  try {
    const { data, error } = await sb
      .from(FC_MESSAGES_TABLE)
      .select('*')
      .or(
        `and(sender_id.eq.${me},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${me})`,
      )
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) {
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      else if (box) box.innerHTML = '<div class="fc-empty-hint">Erreur de chargement.</div>';
      return;
    }
    fcMessages = data || [];
    await fcLoadReactionsFor(fcMessages.map((m) => m.id));
    fcRenderMessages();
  } catch (e) {
    console.warn('fcLoadMessages:', e);
  }
}

// ══ Rendu des messages ══
function fcCustomFieldHtml(cf) {
  if (cf.type === 'text') {
    return `<div class="fc-trade-notes"><span style="color:var(--text);font-style:normal;">${fcEsc(cf.label)} :</span> ${fcEsc(String(cf.value))}</div>`;
  }
  let displayVal;
  if (cf.type === 'stars') {
    const n = parseFloat(cf.value) || 0;
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= Math.round(n) ? '★' : '☆';
    displayVal = s;
  } else {
    displayVal = fcEsc(String(cf.value));
  }
  return `<div class="fc-trade-row"><span>${fcEsc(cf.label)}</span><span>${displayVal}</span></div>`;
}
function fcBuildTradeCardHtml(t) {
  const res = typeof t.res === 'number' ? t.res : parseFloat(t.res) || 0;
  const resColor =
    res >= 0 ? 'var(--fc-trade-pos-color,var(--green))' : 'var(--fc-trade-neg-color,var(--red))';
  const pctTxt =
    typeof t.resPct === 'number' ? ` (${t.resPct >= 0 ? '+' : ''}${t.resPct.toFixed(2)}%)` : '';
  const resTxt = (res >= 0 ? '+' : '') + res.toFixed(2) + ' €' + pctTxt;
  const capTxt =
    typeof t.capitalAvant === 'number' && typeof t.capitalApres === 'number'
      ? `${t.capitalAvant.toLocaleString('fr-FR')} € → ${t.capitalApres.toLocaleString('fr-FR')} €`
      : '';
  const tfList = (t.tf || '').split('|').filter(Boolean);
  const confList = (t.conf || '').split('|').filter(Boolean);
  const imgs = Array.isArray(t.images) ? t.images.slice(0, 6) : [];
  const starsN = parseFloat(t.stars) || 0;
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) starsHtml += i <= Math.round(starsN) ? '★' : '☆';
  return `<div class="fc-trade-card">
    <div class="fc-trade-card-head${imgs.length ? ' fc-has-img' : ''}"${imgs.length ? ' onclick="fcOpenTradeCardImages(this)" title="Voir le graphique en grand"' : ''}>
      <span>${fcEsc(t.paire || '—')}${t.dir ? ' · ' + fcEsc(t.dir) : ''}${t.backtest ? '&nbsp;<span class="fc-bt-badge">BT</span>' : ''}</span>
      <span style="color:${resColor};font-weight:700;">${fcEsc(resTxt)}</span>
    </div>
    <div class="fc-trade-card-body">
      <div class="fc-trade-row"><span>Date</span><span>${fcEsc(t.date || '—')}${t.heure ? ' ' + fcEsc(t.heure) : ''}</span></div>
      ${t.session ? `<div class="fc-trade-row"><span>Session</span><span>${fcEsc(t.session)}</span></div>` : ''}
      ${capTxt ? `<div class="fc-trade-row"><span>Compte</span><span>${fcEsc(capTxt)}</span></div>` : ''}
      ${t.rrCible ? `<div class="fc-trade-row"><span>RR Visé</span><span>${fcEsc(String(t.rrCible))}R</span></div>` : ''}
      ${typeof t.rrReel === 'number' && t.rrReel ? `<div class="fc-trade-row"><span>RR Pris</span><span>${fcEsc(String(t.rrReel))}R</span></div>` : ''}
      ${t.mgmt ? `<div class="fc-trade-row"><span>Mgmt</span><span>${fcEsc(t.mgmt)}</span></div>` : ''}
      ${t.reprend ? `<div class="fc-trade-row"><span>Reprend.</span><span>${fcEsc(t.reprend)}</span></div>` : ''}
      ${starsN ? `<div class="fc-trade-row"><span>Note</span><span>${starsHtml}</span></div>` : ''}
      ${Array.isArray(t.customFields) && t.customFields.length ? t.customFields.map(fcCustomFieldHtml).join('') : ''}
      ${
        tfList.length || confList.length
          ? `<div class="fc-trade-chips">${tfList
              .concat(confList)
              .map((c) => `<span class="fc-trade-chip">${fcEsc(c)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${t.notes ? `<div class="fc-trade-notes">${fcEsc(t.notes)}</div>` : ''}
      ${imgs.length ? `<div class="fc-trade-imgs">${imgs.map((src) => `<img src="${fcEsc(src)}" onclick="fcOpenTradeImg(this)">`).join('')}</div>` : ''}
    </div>
  </div>`;
}
function fcAudioBubbleHtml(m, avatarUrl) {
  return `<div class="fc-audio-msg" data-msg-id="${m.id}">
    <div class="fc-audio-avatar">${avatarUrl ? `<img src="${fcEsc(avatarUrl)}" alt="">` : ''}</div>
    <button class="fc-audio-play" data-msg-id="${m.id}" data-audio-url="${fcEsc(m.audio_url)}" onclick="fcToggleAudioPlay(this.dataset.msgId, this.dataset.audioUrl)">▶</button>
    <div class="fc-audio-bar"><div class="fc-audio-bar-fill"></div></div>
    <span class="fc-audio-duration">${fcFmtDuration(m.audio_duration)}</span>
  </div>`;
}
function fcRenderBubbleContent(m, mine) {
  if (m.deleted) {
    return `<div class="fc-bubble-text fc-bubble-deleted">Message supprimé</div>`;
  }
  if (m.msg_type === 'audio') {
    const myProfile = typeof getProfile === 'function' ? getProfile() : null;
    const avatarUrl = mine
      ? (myProfile && myProfile.photo) || ''
      : (fcContacts.find((c) => c.friendId === m.sender_id) || {}).photo || '';
    return fcAudioBubbleHtml(m, avatarUrl);
  }
  if (m.msg_type === 'trade' && m.trade_data) return fcBuildTradeCardHtml(m.trade_data);
  const text = fcEsc(m.content || '').replace(/\n/g, '<br>');
  const editedTag = m.edited_at ? '<span class="fc-bubble-edited">(modifié)</span>' : '';
  return `<div class="fc-bubble-text">${text}${editedTag}</div>`;
}
function fcRenderMessageRow(m, me) {
  const mine = m.sender_id === me;
  const reactions = fcReactionsMap[m.id] || [];
  const triggerHtml = `<button class="fc-react-trigger" onclick="event.stopPropagation();fcOpenReactionPicker(${m.id}, this)" title="Réagir"><span class="fc-react-face">🙂</span><span class="fc-react-plus">+</span></button>`;
  const badgesHtml = reactions.length
    ? `<div class="fc-react-badges">${reactions.map((r) => `<span class="fc-react-badge">${fcEsc(r.emoji)}</span>`).join('')}</div>`
    : '';
  // Clic droit (ou appui long sur mobile, qui déclenche aussi contextmenu) —
  // uniquement sur ses propres messages non supprimés : modifier/supprimer.
  const ctxAttr =
    mine && !m.deleted ? ` oncontextmenu="fcOpenMessageMenu(event, ${m.id}); return false;"` : '';
  const bubbleHtml = `<div class="fc-bubble-wrap">
      <div class="fc-bubble"${ctxAttr}>${fcRenderBubbleContent(m, mine)}<div class="fc-bubble-time">${fcFmtTime(m.created_at)}</div></div>
      ${badgesHtml}
    </div>`;
  const inner = mine ? triggerHtml + bubbleHtml : bubbleHtml + triggerHtml;
  return `<div class="fc-msg-row${mine ? ' mine' : ''}" onclick="fcOnMessageRowClick(event,this)"><div class="fc-msg-inner">${inner}</div></div>`;
}
// Clic sur le bandeau d'un trade partagé (paire · direction · gain) : affiche son
// graphique (capture jointe) en grand, centré, avec de la marge sur les côtés.
// Clic sur une miniature d'un trade partagé : même visionneuse que dans « Modifier le trade »
// (toutes les images du trade en galerie : bandeau de miniatures + flèches pour passer de l'une à l'autre).
function fcOpenTradeImg(imgEl) {
  const wrap = imgEl.closest('.fc-trade-imgs');
  const imgs = wrap ? Array.from(wrap.querySelectorAll('img')) : [imgEl];
  const srcs = imgs.map((i) => i.src);
  const idx = Math.max(0, imgs.indexOf(imgEl));
  if (typeof openFullscreen === 'function') openFullscreen(srcs[idx], srcs, idx);
}
function fcOpenTradeCardImages(headEl) {
  const card = headEl.closest('.fc-trade-card');
  if (!card) return;
  const srcs = Array.from(card.querySelectorAll('.fc-trade-imgs img')).map((i) => i.src);
  if (!srcs.length || typeof openFullscreen !== 'function') return;
  openFullscreen(srcs[0], srcs, 0);
  try {
    const ov = document.body.lastElementChild;
    const im = ov && ov.querySelector('img');
    if (im) {
      im.style.maxWidth = 'min(82vw, 1500px)';
      im.style.maxHeight = '74vh';
      im.style.minWidth = 'min(60vw, 900px)';
      im.style.objectFit = 'contain';
    }
  } catch (e) {}
}
function fcOnMessageRowClick(e, rowEl) {
  if (e.target.closest('.fc-react-trigger, .fc-audio-play, .fc-trade-imgs img, .fc-trade-card-head.fc-has-img')) return;
  document.querySelectorAll('.fc-msg-row.show-react').forEach((r) => {
    if (r !== rowEl) r.classList.remove('show-react');
  });
  rowEl.classList.toggle('show-react');
}
function fcRenderMessages() {
  const box = document.getElementById('fcMessages');
  if (!box) return;
  const me = currentUser && currentUser.id;
  if (!fcMessages.length) {
    box.innerHTML = '<div class="fc-empty-hint">Aucun message pour le moment.</div>';
    return;
  }
  box.innerHTML = fcMessages.map((m) => fcRenderMessageRow(m, me)).join('');
  box.scrollTop = box.scrollHeight;
}

// ══ Modifier / supprimer un message (uniquement les siens) ══
let fcEditingMsgId = null;

function fcCloseMsgMenu() {
  document.getElementById('fcMsgMenu')?.remove();
}
function fcOpenMessageMenu(e, msgId) {
  e.preventDefault();
  e.stopPropagation();
  fcCloseMsgMenu();
  const m = fcMessages.find((x) => x.id === msgId);
  if (!m || !currentUser || m.sender_id !== currentUser.id || m.deleted) return;
  const menu = document.createElement('div');
  menu.id = 'fcMsgMenu';
  menu.className = 'fc-msg-menu';
  const editBtn =
    m.msg_type === 'text'
      ? `<button onclick="fcCloseMsgMenu();fcOpenEditMessage(${m.id})">Modifier</button>`
      : '';
  menu.innerHTML = `${editBtn}<button class="fc-msg-menu-danger" onclick="fcCloseMsgMenu();fcAskDeleteMessage(${m.id})">Supprimer pour tout le monde</button>`;
  document.body.appendChild(menu);
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const menuW = 200;
  menu.style.left = Math.max(6, Math.min(x, window.innerWidth - menuW)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, window.innerHeight - 100)) + 'px';
  setTimeout(() => {
    document.addEventListener(
      'click',
      function h() {
        fcCloseMsgMenu();
        document.removeEventListener('click', h);
      },
      {once: true}
    );
  }, 30);
}

function fcOpenEditMessage(msgId) {
  const m = fcMessages.find((x) => x.id === msgId);
  if (!m || !currentUser || m.sender_id !== currentUser.id || m.msg_type !== 'text' || m.deleted)
    return;
  fcEditingMsgId = msgId;
  const modal = document.getElementById('fcEditMsgModal');
  const input = document.getElementById('fcEditMsgInput');
  if (!modal || !input) return;
  input.value = m.content || '';
  modal.classList.add('open');
  setTimeout(() => input.focus(), 50);
}
function fcCloseEditModal() {
  document.getElementById('fcEditMsgModal')?.classList.remove('open');
  fcEditingMsgId = null;
}
async function fcSaveEditedMessage() {
  const input = document.getElementById('fcEditMsgInput');
  const newContent = (input?.value || '').trim();
  const msgId = fcEditingMsgId;
  if (!msgId || !newContent || typeof sb === 'undefined') {
    fcCloseEditModal();
    return;
  }
  try {
    const {data, error} = await sb
      .from(FC_MESSAGES_TABLE)
      .update({content: newContent, edited_at: new Date().toISOString()})
      .eq('id', msgId)
      .eq('sender_id', currentUser.id)
      .select()
      .single();
    if (error) throw error;
    const idx = fcMessages.findIndex((x) => x.id === msgId);
    if (idx !== -1) fcMessages[idx] = data;
    fcSyncLastMsg(data);
    fcRenderMessages();
  } catch (e) {
    console.warn('fcSaveEditedMessage:', e);
    if (typeof showSync === 'function') showSync('⚠ Modification du message échouée', '#ef4444');
  } finally {
    fcCloseEditModal();
  }
}

function fcAskDeleteMessage(msgId) {
  const m = fcMessages.find((x) => x.id === msgId);
  if (!m || !currentUser || m.sender_id !== currentUser.id) return;
  const doDelete = () => fcDeleteMessageForEveryone(msgId);
  if (typeof showConfirm === 'function') {
    showConfirm(
      'Supprimer le message',
      'Le supprimer pour tout le monde, même si déjà vu par l’autre personne ?',
      doDelete
    );
  } else {
    doDelete();
  }
}
async function fcDeleteMessageForEveryone(msgId) {
  if (typeof sb === 'undefined' || !currentUser) return;
  try {
    const {data, error} = await sb
      .from(FC_MESSAGES_TABLE)
      .update({
        deleted: true,
        content: null,
        audio_url: null,
        audio_duration: null,
        trade_data: null
      })
      .eq('id', msgId)
      .eq('sender_id', currentUser.id)
      .select()
      .single();
    if (error) throw error;
    const idx = fcMessages.findIndex((x) => x.id === msgId);
    if (idx !== -1) fcMessages[idx] = data;
    fcSyncLastMsg(data);
    fcRenderMessages();
  } catch (e) {
    console.warn('fcDeleteMessageForEveryone:', e);
    if (typeof showSync === 'function') showSync('⚠ Suppression du message échouée', '#ef4444');
  }
}
// Reçoit les modifications/suppressions faites par l'autre personne (ou par
// soi-même depuis un autre appareil) en temps réel — voir fcStartRealtime().
function fcHandleMessageUpdate(m) {
  if (!m || !currentUser) return;
  fcSyncLastMsg(m);
  const me = currentUser.id;
  const other = m.sender_id === me ? m.receiver_id : m.sender_id;
  const idx = fcMessages.findIndex((x) => x.id === m.id);
  if (idx === -1) return;
  fcMessages[idx] = m;
  if (fcActiveFriendId === other) fcRenderMessages();
}

// ══ Réactions emoji (un seul emoji par personne et par message) ══
function fcInjectReactPicker() {
  if (document.getElementById('fcReactPicker')) return;
  const el = document.createElement('div');
  el.id = 'fcReactPicker';
  el.className = 'fc-react-picker';
  el.innerHTML = `
    <div class="fc-react-quick">
      ${FC_REACT_EMOJIS.map((em) => `<span class="fc-react-opt" data-emoji="${em}">${em}</span>`).join('')}
      <button class="fc-react-more-btn" title="Plus d'emoji">+</button>
    </div>
    <div class="fc-react-full">
      <div class="fc-react-tabs"></div>
      <div class="fc-react-grid-scroll"></div>
    </div>
  `;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target.closest('.fc-react-more-btn')) {
      fcExpandReactionPicker();
      return;
    }
    const opt = e.target.closest('.fc-react-opt, .fc-react-grid-emoji');
    if (opt && fcReactPickerTargetId != null)
      fcSetReaction(fcReactPickerTargetId, opt.dataset.emoji);
  });
}
function fcBuildFullEmojiPicker() {
  const el = document.getElementById('fcReactPicker');
  const tabs = el && el.querySelector('.fc-react-tabs');
  const scroll = el && el.querySelector('.fc-react-grid-scroll');
  if (!tabs || !scroll || tabs.dataset.built) return;
  tabs.dataset.built = '1';
  tabs.innerHTML = FC_EMOJI_CATEGORIES.map(
    (cat, i) =>
      `<span class="fc-react-tab${i === 0 ? ' active' : ''}" data-cat="${i}" title="${fcEsc(cat.name)}">${cat.icon}</span>`,
  ).join('');
  scroll.innerHTML = FC_EMOJI_CATEGORIES.map(
    (cat, i) => `<div class="fc-react-cat-section" id="fcCatSection${i}">
      <div class="fc-react-cat-label">${fcEsc(cat.name)}</div>
      <div class="fc-react-cat-grid">${cat.emojis.map((em) => `<span class="fc-react-grid-emoji" data-emoji="${em}">${em}</span>`).join('')}</div>
    </div>`,
  ).join('');
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.fc-react-tab');
    if (!tab) return;
    const target = document.getElementById('fcCatSection' + tab.dataset.cat);
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  scroll.addEventListener('scroll', () => fcUpdateActiveReactTab(scroll, tabs));
}
function fcUpdateActiveReactTab(scroll, tabs) {
  const scrollTop = scroll.getBoundingClientRect().top;
  const sections = scroll.querySelectorAll('.fc-react-cat-section');
  let activeIdx = 0;
  sections.forEach((sec, i) => {
    if (sec.getBoundingClientRect().top - scrollTop <= 30) activeIdx = i;
  });
  tabs
    .querySelectorAll('.fc-react-tab')
    .forEach((t, i) => t.classList.toggle('active', i === activeIdx));
}
function fcExpandReactionPicker() {
  const el = document.getElementById('fcReactPicker');
  if (!el) return;
  const quick = el.querySelector('.fc-react-quick');
  const full = el.querySelector('.fc-react-full');
  if (quick) quick.style.display = 'none';
  if (full) full.style.display = 'flex';
  fcBuildFullEmojiPicker();
  fcPositionReactPicker();
}
function fcPositionReactPicker() {
  const picker = document.getElementById('fcReactPicker');
  const triggerEl = fcReactPickerTriggerEl;
  if (!picker || !triggerEl) return;
  const rect = triggerEl.getBoundingClientRect();
  const pRect = picker.getBoundingClientRect();
  let top = rect.top - pRect.height - 8;
  if (top < 4) top = rect.bottom + 8;
  if (top + pRect.height > window.innerHeight - 4)
    top = Math.max(4, window.innerHeight - pRect.height - 4);
  let left = rect.left - pRect.width / 2 + rect.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - pRect.width - 6));
  picker.style.top = top + 'px';
  picker.style.left = left + 'px';
}
let fcReactPickerTriggerEl = null;
function fcOpenReactionPicker(messageId, triggerEl) {
  const picker = document.getElementById('fcReactPicker');
  if (!picker) return;
  fcReactPickerTargetId = messageId;
  fcReactPickerTriggerEl = triggerEl;
  fcRenderQuickReactRow();
  const quick = picker.querySelector('.fc-react-quick');
  const full = picker.querySelector('.fc-react-full');
  if (quick) quick.style.display = 'flex';
  if (full) full.style.display = 'none';
  picker.style.display = 'block';
  fcPositionReactPicker();
  setTimeout(() => document.addEventListener('click', fcOnDocClickClosePicker, { once: true }), 0);
}
function fcCloseReactionPicker() {
  const picker = document.getElementById('fcReactPicker');
  if (picker) picker.style.display = 'none';
  fcReactPickerTargetId = null;
  fcReactPickerTriggerEl = null;
}
function fcOnDocClickClosePicker(e) {
  const picker = document.getElementById('fcReactPicker');
  if (picker && picker.contains(e.target)) {
    // Clic à l'intérieur (onglet, bouton +, emoji) : on ne ferme pas,
    // mais il faut réarmer l'écoute pour le prochain clic réellement extérieur.
    document.addEventListener('click', fcOnDocClickClosePicker, { once: true });
    return;
  }
  fcCloseReactionPicker();
}
async function fcSetReaction(messageId, emoji) {
  fcCloseReactionPicker();
  if (!currentUser || typeof sb === 'undefined') return;
  const me = currentUser.id;
  const list = fcReactionsMap[messageId] || [];
  const mine = list.find((r) => r.user_id === me);
  try {
    if (mine && mine.emoji === emoji) {
      const { error } = await sb
        .from(FC_REACTIONS_TABLE)
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', me);
      if (error) {
        console.warn('fcSetReaction (delete):', error);
        if (!fcIsMissingTableError(error) && typeof showSync === 'function')
          showSync('⚠ Réaction impossible', '#ef4444');
        return;
      }
      fcReactionsMap[messageId] = list.filter((r) => r.user_id !== me);
    } else {
      const { error } = await sb
        .from(FC_REACTIONS_TABLE)
        .upsert(
          { message_id: messageId, user_id: me, emoji },
          { onConflict: 'message_id,user_id' },
        );
      if (error) {
        console.warn('fcSetReaction (upsert):', error);
        if (fcIsMissingTableError(error)) {
          if (typeof showSync === 'function')
            showSync('⚠ Réactions pas encore configurées (migration SQL)', '#f59e0b');
        } else if (typeof showSync === 'function') showSync('⚠ Réaction impossible', '#ef4444');
        return;
      }
      const idx = list.findIndex((r) => r.user_id === me);
      const entry = { user_id: me, emoji, created_at: new Date().toISOString() };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      fcReactionsMap[messageId] = list;
    }
    fcRenderMessages();
    fcComputeRecentEmojis();
  } catch (e) {
    console.warn('fcSetReaction:', e);
  }
}
async function fcLoadReactionsFor(ids) {
  fcReactionsMap = {};
  if (!ids.length || !currentUser || typeof sb === 'undefined') {
    fcComputeRecentEmojis();
    return;
  }
  try {
    const { data, error } = await sb
      .from(FC_REACTIONS_TABLE)
      .select('message_id,user_id,emoji,created_at')
      .in('message_id', ids);
    if (error) return; // dégradation silencieuse : le chat marche sans réactions si la migration n'est pas encore faite
    (data || []).forEach((r) => {
      if (!fcReactionsMap[r.message_id]) fcReactionsMap[r.message_id] = [];
      fcReactionsMap[r.message_id].push({
        user_id: r.user_id,
        emoji: r.emoji,
        created_at: r.created_at,
      });
    });
  } catch (e) {
    console.warn('fcLoadReactionsFor:', e);
  } finally {
    fcComputeRecentEmojis();
  }
}
// Les 6 emoji rapides = les derniers utilisés dans CETTE conversation (par
// n'importe lequel des deux participants), complétés par le jeu par défaut
// s'il n'y a pas encore assez d'historique.
function fcComputeRecentEmojis() {
  const entries = [];
  Object.keys(fcReactionsMap).forEach((mid) => {
    (fcReactionsMap[mid] || []).forEach((r) => {
      if (r.created_at) entries.push(r);
    });
  });
  entries.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const seen = new Set();
  const recent = [];
  entries.forEach((r) => {
    if (!seen.has(r.emoji)) {
      seen.add(r.emoji);
      recent.push(r.emoji);
    }
  });
  FC_REACT_EMOJIS.forEach((em) => {
    if (recent.length < 6 && !seen.has(em)) {
      seen.add(em);
      recent.push(em);
    }
  });
  fcRecentEmojis = recent.slice(0, 6);
  fcRenderQuickReactRow();
}
function fcRenderQuickReactRow() {
  const quick = document.querySelector('#fcReactPicker .fc-react-quick');
  if (!quick) return;
  quick.innerHTML =
    fcRecentEmojis
      .map((em) => `<span class="fc-react-opt" data-emoji="${em}">${em}</span>`)
      .join('') + '<button class="fc-react-more-btn" title="Plus d\'emoji">+</button>';
}
function fcHandleReactionChange(payload) {
  const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
  if (!row || row.message_id == null) return;
  const mid = row.message_id;
  let list = fcReactionsMap[mid] || [];
  if (payload.eventType === 'DELETE') {
    list = list.filter((r) => r.user_id !== row.user_id);
  } else {
    const idx = list.findIndex((r) => r.user_id === row.user_id);
    const entry = { user_id: row.user_id, emoji: row.emoji, created_at: row.created_at };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
  }
  fcReactionsMap[mid] = list;
  if (fcMessages.some((m) => m.id === mid)) {
    fcRenderMessages();
    fcComputeRecentEmojis();
  }
}

// ══ Audio : lecture ══
function fcGetAudioEl() {
  let el = document.getElementById('fcAudioPlayer');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'fcAudioPlayer';
    el.style.display = 'none';
    document.body.appendChild(el);
    el.addEventListener('timeupdate', fcUpdateAudioProgress);
    el.addEventListener('ended', () => {
      fcAudioPlayingId = null;
      fcUpdateAudioProgress();
    });
  }
  return el;
}
function fcToggleAudioPlay(msgId, url) {
  const el = fcGetAudioEl();
  if (fcAudioPlayingId === msgId && !el.paused) {
    el.pause();
    fcAudioPlayingId = null;
  } else {
    if (fcAudioPlayingId !== msgId) el.src = url;
    el.play().catch(() => {});
    fcAudioPlayingId = msgId;
  }
  fcUpdateAudioProgress();
}
function fcUpdateAudioProgress() {
  const el = document.getElementById('fcAudioPlayer');
  document.querySelectorAll('.fc-audio-msg').forEach((row) => {
    const id = row.dataset.msgId;
    const btn = row.querySelector('.fc-audio-play');
    const fill = row.querySelector('.fc-audio-bar-fill');
    const isPlaying = el && id === String(fcAudioPlayingId) && !el.paused;
    if (btn) btn.textContent = isPlaying ? '❙❙' : '▶';
    if (fill) {
      const pct = isPlaying && el.duration ? (el.currentTime / el.duration) * 100 : 0;
      fill.style.width = pct + '%';
    }
  });
  if (fcAudioPlayingId != null) requestAnimationFrame(() => {}); // pas de polling supplémentaire, timeupdate suffit
}

// ══ Envoi de messages ══
async function fcSendMessage(payload) {
  if (!currentUser || !fcActiveFriendId || typeof sb === 'undefined') return;
  const row = Object.assign(
    {
      sender_id: currentUser.id,
      receiver_id: fcActiveFriendId,
      msg_type: 'text',
      content: null,
      audio_url: null,
      audio_duration: null,
      trade_data: null,
    },
    payload,
  );
  try {
    const { data, error } = await sb.from(FC_MESSAGES_TABLE).insert(row).select().single();
    if (error) {
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      else if (typeof showSync === 'function') showSync('⚠ Message non envoyé', '#ef4444');
      return;
    }
    if (!fcMessages.some((m) => m.id === data.id)) {
      fcMessages.push(data);
      fcRenderMessages();
    }
    fcActivityMap[fcActiveFriendId] = data.created_at;
    fcLastMsgMap[fcActiveFriendId] = data;
    fcRenderContactList();
  } catch (e) {
    console.warn('fcSendMessage:', e);
    if (typeof showSync === 'function') showSync('⚠ Réseau', '#f59e0b');
  }
}
function fcSendTextMessage() {
  const input = document.getElementById('fcTextInput');
  if (!input || !fcActiveFriendId) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  fcUpdateMicSendBtn();
  fcSendMessage({ msg_type: 'text', content: text });
}

// ══ Partage d'un trade (fiche technique complète) ══
function fcOpenTradePicker() {
  if (!fcActiveFriendId) return;
  fcRenderTradePickerList('');
  const modal = document.getElementById('fcTradeModal');
  if (modal) modal.classList.add('open');
  const search = document.getElementById('fcTradeSearchInput');
  if (search) {
    search.value = '';
    search.focus();
  }
}
function fcCloseTradePicker() {
  const modal = document.getElementById('fcTradeModal');
  if (modal) modal.classList.remove('open');
}
function fcRenderTradePickerList(filter) {
  const list = document.getElementById('fcTradePickList');
  if (!list) return;
  const f = (filter || '').toLowerCase();
  const trades = (APP.trades || [])
    .filter((t) => !f || (t.paire || '').toLowerCase().includes(f) || (t.date || '').includes(f))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id)
    .slice(0, 60);
  if (!trades.length) {
    list.innerHTML = '<div class="fc-empty-hint">Aucun trade trouvé.</div>';
    return;
  }
  list.innerHTML = trades
    .map((t) => {
      const res = typeof t.res === 'number' ? t.res : parseFloat(t.res) || 0;
      const resColor =
        res >= 0
          ? 'var(--fc-trade-pos-color,var(--green))'
          : 'var(--fc-trade-neg-color,var(--red))';
      return `<div class="fc-trade-pick-item" onclick="fcSendTradeMessage(${t.id})">
        <div class="fc-trade-pick-info">
          <div class="fc-trade-pick-pair">${fcEsc(t.paire || '—')}${t.dir ? ' · ' + fcEsc(t.dir) : ''}${t.backtest ? '&nbsp;<span class="fc-bt-badge">BT</span>' : ''}</div>
          <div class="fc-trade-pick-meta">${fcEsc(t.date || '')}${t.heure ? ' ' + fcEsc(t.heure) : ''}</div>
        </div>
        <div style="color:${resColor};font-family:var(--mono);font-size:12px;font-weight:700;flex-shrink:0;">${res >= 0 ? '+' : ''}${res.toFixed(2)}€</div>
      </div>`;
    })
    .join('');
}
function fcCollectCustomFields(t) {
  if (!Array.isArray(APP.cfFields) || !APP.cfFields.length) return [];
  const out = [];
  APP.cfFields.forEach((f) => {
    const val = typeof cfDisplayValue === 'function' ? cfDisplayValue(f, t) : t['cf_' + f.id];
    if (val === undefined || val === null || val === '') return;
    out.push({ label: f.colName || f.label || f.id, type: f.type, value: val });
  });
  return out;
}
// Capital avant/après ce trade + % du résultat par rapport à ce capital.
// Deux séries JAMAIS mélangées : un trade backtest se compare uniquement
// aux AUTRES trades backtest, un trade réel uniquement aux autres trades
// réels — chacune part du même Capital de départ (CAPITAL(), il n'existe
// pas de capital de départ séparé pour le backtest dans l'app) mais
// accumule séparément (signalé le 16/09/2026 : jusqu'ici un trade réel
// pouvait inclure à tort le résultat de trades backtest antérieurs dans
// son "capital avant", et inversement). Recalculé une seule fois ICI, au
// moment du partage, et mémorisé dans le message — un ami qui reçoit la
// fiche n'a pas forcément ce trade dans ses propres APP.trades pour le
// recalculer lui-même, et la fiche doit de toute façon rester une photo
// figée de l'état au moment du partage.
function fcCapBeforeAfterPct(trade) {
  const isBT = !!trade.backtest;
  const s = (APP.trades || [])
    .filter((x) => !!x.backtest === isBT)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || ''));
  let cap = typeof CAPITAL === 'function' ? CAPITAL() : 0;
  for (const t of s) {
    if (t.id === trade.id) {
      const res = t.res || 0;
      return {avant: cap, apres: cap + res, pct: cap ? (res / cap) * 100 : 0};
    }
    cap += t.res || 0;
  }
  return null;
}
function fcSendTradeMessage(tradeId) {
  const t = (APP.trades || []).find((x) => x.id === tradeId);
  if (!t) return;
  const capInfo = fcCapBeforeAfterPct(t);
  const payload = {
    id: t.id,
    date: t.date || '',
    heure: t.heure || '',
    session: t.session || '',
    paire: t.paire || '',
    dir: t.dir || '',
    rrCible: t.rrCible || 0,
    // RR Pris RÉEL, valable aussi bien en mode manuel qu'automatique — computeRR()
    // gère déjà les deux (renvoie t.rrPris tel quel en manuel, sinon le calcule à
    // partir du capital/risque réellement actifs au moment du trade). Avant ce
    // correctif, seul t.rrPris était envoyé, qui ne contient une valeur qu'en
    // mode manuel : un trade en RR auto n'affichait donc jamais son RR Pris
    // dans la fiche partagée (signalé le 16/09/2026).
    rrReel: typeof computeRR === 'function' ? computeRR(t) : t.rrPris || 0,
    res: t.res || 0,
    resPct: capInfo ? capInfo.pct : null,
    capitalAvant: capInfo ? capInfo.avant : null,
    capitalApres: capInfo ? capInfo.apres : null,
    mgmt: t.mgmt || '',
    reprend: t.reprend || '',
    notes: t.notes || '',
    stars: t.stars || 0,
    tf: t.tf || '',
    conf: t.conf || '',
    backtest: !!t.backtest,
    customFields: fcCollectCustomFields(t),
    images: Array.isArray(t.images) ? t.images.slice(0, 6) : [],
  };
  fcSendMessage({ msg_type: 'trade', trade_data: payload });
  fcCloseTradePicker();
}

// ══ Messages vocaux (rester appuyé sur le micro, glisser à gauche pour annuler) ══
const FC_WAVE_BAR_WIDTH = 3; // px — barres fines et verticales, comme avant
const FC_WAVE_BAR_GAP = 2; // px
let fcDragStartX = 0;
let fcDragArmed = false;
let fcDragMaxPx = -240;

let fcMediaRecorder = null;
let fcRecordedChunks = [];
let fcRecordStart = 0;
let fcRecordTimerHandle = null;
let fcRecordStream = null;
let fcAudioCtx = null;
let fcAnalyser = null;
let fcAnalyserData = null;
let fcWaveIntervalHandle = null;
let fcWaveSamples = [];

function fcInitWaveBars() {
  const wave = document.getElementById('fcRecWave');
  if (!wave) return;
  // Le nombre de barres est recalculé à chaque enregistrement à partir de la
  // largeur réellement disponible (téléphone ou PC) : les barres restent
  // fines à taille fixe, c'est leur NOMBRE qui s'adapte à l'écran pour aller
  // pile jusqu'au bout, au lieu de les étirer.
  const containerWidth = wave.getBoundingClientRect().width;
  let count = Math.floor(
    (containerWidth + FC_WAVE_BAR_GAP) / (FC_WAVE_BAR_WIDTH + FC_WAVE_BAR_GAP),
  );
  if (!count || count < 15) count = 15; // garde-fou si mesuré avant mise en page
  wave.innerHTML = '';
  fcWaveSamples = new Array(count).fill(0);
  for (let i = 0; i < count; i++) {
    const bar = document.createElement('div');
    bar.className = 'fc-wave-bar';
    wave.appendChild(bar);
  }
}
function fcSampleAndRenderWave() {
  if (!fcAnalyser || !fcAnalyserData) return;
  fcAnalyser.getByteTimeDomainData(fcAnalyserData);
  let maxDev = 0;
  for (let i = 0; i < fcAnalyserData.length; i++) {
    const dev = Math.abs(fcAnalyserData[i] - 128);
    if (dev > maxDev) maxDev = dev;
  }
  // Courbe racine + seuil bas : une voix normale doit déjà bien faire bouger les barres.
  const vol = Math.min(1, Math.sqrt(maxDev / 12));
  fcWaveSamples.shift();
  fcWaveSamples.push(vol);
  const wave = document.getElementById('fcRecWave');
  if (!wave) return;
  const bars = wave.children;
  for (let i = 0; i < bars.length; i++) {
    bars[i].style.height = 15 + fcWaveSamples[i] * 85 + '%';
  }
}

async function fcStartRecording() {
  if (fcMediaRecorder || !fcActiveFriendId) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (typeof showSync === 'function') showSync('⚠ Micro non supporté', '#ef4444');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    fcRecordStream = stream;
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mime = mimeCandidates.find(
      (m) =>
        window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m),
    );
    fcMediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    fcRecordedChunks = [];
    fcMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) fcRecordedChunks.push(e.data);
    };
    fcMediaRecorder.start();
    fcRecordStart = Date.now();
    fcShowRecordingUI(true);
    fcRecordTimerHandle = setInterval(fcUpdateRecTimer, 200);
    try {
      fcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (fcAudioCtx.state === 'suspended') fcAudioCtx.resume().catch(() => {});
      const source = fcAudioCtx.createMediaStreamSource(stream);
      fcAnalyser = fcAudioCtx.createAnalyser();
      fcAnalyser.fftSize = 64;
      fcAnalyserData = new Uint8Array(fcAnalyser.fftSize);
      source.connect(fcAnalyser);
      fcInitWaveBars();
      fcWaveIntervalHandle = setInterval(fcSampleAndRenderWave, 33);
    } catch (e) {
      fcAnalyser = null; // pas grave : l'enregistrement marche même sans le rendu visuel
    }
  } catch (e) {
    console.warn('getUserMedia error:', e && e.name, e && e.message);
    let msg = '⚠ Micro inaccessible';
    if (e && e.name === 'NotAllowedError') msg = '⚠ Autorise le micro dans les réglages du site';
    else if (e && e.name === 'NotFoundError') msg = '⚠ Aucun micro détecté sur cet appareil';
    else if (e && e.name === 'NotReadableError') msg = '⚠ Micro déjà utilisé par une autre appli';
    else if (e && e.name === 'SecurityError') msg = '⚠ Connexion non sécurisée (HTTPS requis)';
    if (typeof showSync === 'function') showSync(msg, '#ef4444');
  }
}
function fcUpdateRecTimer() {
  const el = document.getElementById('fcRecTimer');
  if (el) el.textContent = fcFmtDuration((Date.now() - fcRecordStart) / 1000);
}
function fcShowRecordingUI(on) {
  const indicator = document.getElementById('fcRecIndicator');
  const input = document.getElementById('fcTextInput');
  const attachBtn = document.getElementById('fcAttachBtn');
  const cancelBtn = document.getElementById('fcCancelBtn');
  const micBtn = document.getElementById('fcMicBtn');
  const mobile = typeof micHoldMode === 'function' ? micHoldMode() : window.innerWidth <= 1100;
  if (indicator) indicator.style.display = on ? 'flex' : 'none';
  if (input) input.style.display = on ? 'none' : 'block';
  if (attachBtn) attachBtn.style.display = on ? 'none' : 'flex';
  if (cancelBtn) cancelBtn.style.display = on ? 'flex' : 'none';
  if (micBtn) {
    if (on && !mobile) {
      micBtn.dataset.mode = 'recording-send';
      micBtn.innerHTML = FC_ICON_SEND;
    } else if (!on) {
      fcUpdateMicSendBtn();
    }
  }
}
function fcStopRecording(shouldSend) {
  if (!fcMediaRecorder) return;
  clearInterval(fcRecordTimerHandle);
  clearInterval(fcWaveIntervalHandle);
  if (fcAudioCtx) {
    try {
      fcAudioCtx.close();
    } catch (e) {}
    fcAudioCtx = null;
  }
  fcAnalyser = null;
  fcAnalyserData = null;
  const recorder = fcMediaRecorder;
  const stream = fcRecordStream;
  const startedAt = fcRecordStart;
  fcMediaRecorder = null;
  fcRecordStream = null;
  fcShowRecordingUI(false);
  try {
    recorder.onstop = async () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const duration = (Date.now() - startedAt) / 1000;
      if (!shouldSend || duration < 0.6 || !fcRecordedChunks.length) {
        fcRecordedChunks = [];
        return;
      }
      const blob = new Blob(fcRecordedChunks, { type: recorder.mimeType || 'audio/webm' });
      fcRecordedChunks = [];
      await fcUploadAndSendAudio(blob, duration);
    };
    recorder.stop();
  } catch (e) {
    console.warn('fcStopRecording:', e);
  }
}

// ── Téléphone : glisser le micro vers la gauche pour annuler (comme WhatsApp mobile) ──
function fcOnMicPointerDown(e) {
  const micBtn = document.getElementById('fcMicBtn');
  if (!micBtn || !micHoldMode() || micBtn.dataset.mode !== 'mic') return;
  e.preventDefault();
  fcDragStartX = e.clientX;
  fcDragArmed = false;
  const bar = document.getElementById('fcInputBarRow');
  const micRect = micBtn.getBoundingClientRect();
  if (bar) {
    const barRect = bar.getBoundingClientRect();
    // Il faut amener le micro jusqu'à l'extrémité gauche de la barre
    // (même emplacement que le bouton corbeille), pas juste de quelques px.
    fcDragMaxPx = -(micRect.left - barRect.left - 26);
    if (fcDragMaxPx > -90) fcDragMaxPx = -90; // garde-fou sur très petits écrans
  } else {
    fcDragMaxPx = -240;
  }
  try {
    micBtn.setPointerCapture(e.pointerId);
  } catch (err) {}
  micBtn.style.transition = 'none';
  fcStartRecording();
}
function fcOnMicPointerMove(e) {
  if (!micHoldMode() || !fcMediaRecorder) return;
  const micBtn = document.getElementById('fcMicBtn');
  if (!micBtn) return;
  let dx = Math.min(0, e.clientX - fcDragStartX);
  dx = Math.max(dx, fcDragMaxPx);
  micBtn.style.transform = 'translateX(' + dx + 'px)';
  const armed = dx <= fcDragMaxPx * 0.92;
  if (armed !== fcDragArmed) {
    fcDragArmed = armed;
    const cancelBtn = document.getElementById('fcCancelBtn');
    if (cancelBtn) cancelBtn.classList.toggle('armed', armed);
  }
}
function fcOnMicPointerUp() {
  if (!micHoldMode()) return;
  const micBtn = document.getElementById('fcMicBtn');
  if (micBtn) {
    micBtn.style.transition = '';
    micBtn.style.transform = '';
  }
  const cancelBtn = document.getElementById('fcCancelBtn');
  if (cancelBtn) cancelBtn.classList.remove('armed');
  if (micBtn && micBtn.dataset.mode === 'mic' && fcMediaRecorder) {
    fcStopRecording(!fcDragArmed);
  }
  fcDragArmed = false;
}
// ── PC : clic pour démarrer, clic sur l'avion pour envoyer, clic sur la corbeille pour annuler ──
function fcOnMicClick() {
  const micBtn = document.getElementById('fcMicBtn');
  if (!micBtn) return;
  const mode = micBtn.dataset.mode;
  if (mode === 'send') {
    fcSendTextMessage();
  } else if (mode === 'recording-send') {
    fcStopRecording(true);
  } else if (mode === 'mic' && !micHoldMode()) {
    fcStartRecording();
  }
}
async function fcUploadAndSendAudio(blob, duration) {
  if (!currentUser || !fcActiveFriendId || typeof sb === 'undefined') return;
  try {
    const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    const fileName = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage
      .from(FC_AUDIO_BUCKET)
      .upload(fileName, blob, { contentType: blob.type || 'audio/webm', upsert: false });
    if (error) {
      if (fcIsMissingTableError(error)) fcShowSetupNotice();
      else if (typeof showSync === 'function') showSync('⚠ Envoi du vocal échoué', '#ef4444');
      return;
    }
    const { data: urlData } = sb.storage.from(FC_AUDIO_BUCKET).getPublicUrl(fileName);
    await fcSendMessage({
      msg_type: 'audio',
      audio_url: urlData && urlData.publicUrl,
      audio_duration: duration,
    });
  } catch (e) {
    console.warn('fcUploadAndSendAudio:', e);
    if (typeof showSync === 'function') showSync('⚠ Réseau', '#f59e0b');
  }
}

// ══ Barre de saisie : bascule micro / envoyer ══
function fcUpdateMicSendBtn() {
  const input = document.getElementById('fcTextInput');
  const btn = document.getElementById('fcMicBtn');
  if (!input || !btn) return;
  const hasText = input.value.trim().length > 0;
  btn.dataset.mode = hasText ? 'send' : 'mic';
  btn.innerHTML = hasText ? FC_ICON_SEND : FC_ICON_MIC;
  btn.title = hasText
    ? 'Envoyer'
    : typeof micHoldMode === 'function' && !micHoldMode()
      ? 'Message vocal (clique pour enregistrer)'
      : 'Message vocal (rester appuyé)';
}
function fcBindInputBarEvents() {
  const input = document.getElementById('fcTextInput');
  const micBtn = document.getElementById('fcMicBtn');
  const attachBtn = document.getElementById('fcAttachBtn');
  const cancelBtn = document.getElementById('fcCancelBtn');
  if (input) {
    input.addEventListener('input', () => {
      if (typeof autoGrow === 'function') autoGrow(input);
      fcUpdateMicSendBtn();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        fcSendTextMessage();
      }
    });
  }
  if (attachBtn) attachBtn.addEventListener('click', fcOpenTradePicker);
  if (cancelBtn) cancelBtn.addEventListener('click', () => fcStopRecording(false));
  if (micBtn) {
    micBtn.addEventListener('click', fcOnMicClick);
    micBtn.addEventListener('pointerdown', fcOnMicPointerDown);
    micBtn.addEventListener('pointermove', fcOnMicPointerMove);
    ['pointerup', 'pointercancel'].forEach((evt) => micBtn.addEventListener(evt, fcOnMicPointerUp));
  }
  fcUpdateMicSendBtn();
}

// ══ Temps réel ══
function fcStartRealtime() {
  if (!currentUser || fcChannel || typeof sb === 'undefined') return;
  const me = currentUser.id;
  fcChannel = sb
    .channel('tjp_chat_' + me)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: FC_MESSAGES_TABLE,
        filter: 'receiver_id=eq.' + me,
      },
      (payload) => fcHandleIncomingMessage(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: FC_MESSAGES_TABLE, filter: 'sender_id=eq.' + me },
      (payload) => fcHandleIncomingMessage(payload.new),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: FC_MESSAGES_TABLE,
        filter: 'receiver_id=eq.' + me,
      },
      (payload) => fcHandleMessageUpdate(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: FC_MESSAGES_TABLE, filter: 'sender_id=eq.' + me },
      (payload) => fcHandleMessageUpdate(payload.new),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: FC_CONTACTS_TABLE,
        filter: 'contact_user_id=eq.' + me,
      },
      () => fcLoadContacts(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: FC_CONTACTS_TABLE, filter: 'user_id=eq.' + me },
      () => fcLoadContacts(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: FC_REACTIONS_TABLE },
      (payload) => fcHandleReactionChange(payload),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: FC_READS_TABLE, filter: 'user_id=eq.' + me },
      (payload) => fcHandleRemoteRead(payload.new),
    )
    .subscribe();
}
function fcStopRealtime() {
  if (fcChannel && typeof sb !== 'undefined') {
    sb.removeChannel(fcChannel);
    fcChannel = null;
  }
}
function fcHandleIncomingMessage(m) {
  if (!m || !currentUser) return;
  const me = currentUser.id;
  const other = m.sender_id === me ? m.receiver_id : m.sender_id;
  if (fcActiveFriendId === other && !fcMessages.some((x) => x.id === m.id)) {
    fcMessages.push(m);
    fcRenderMessages();
    if (m.sender_id === other) fcMarkRead(other); // vue en direct : reste marqué comme lu
  }
  fcActivityMap[other] = m.created_at;
  fcLastMsgMap[other] = m;
  if (fcContacts.some((c) => c.friendId === other)) fcRefreshActivityOrder();
  else fcLoadContacts();
}

// ══ Initialisation / nettoyage ══
// ══ Le cadre du chat va toujours pile jusqu'en bas de l'écran (jamais plus,
// jamais moins), quel que soit l'appareil : seules les listes internes
// (contacts / conversation) défilent, jamais la page elle-même. ══
function fcResizeWrap() {
  const wrap = document.getElementById('fcWrap');
  const page = document.getElementById('page-ami');
  if (!wrap || !page || !page.classList.contains('active')) return;
  const top = wrap.getBoundingClientRect().top;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const pagePB = parseFloat(getComputedStyle(page).paddingBottom) || 0;
  let h = vh - top - pagePB - 8; // petite marge de sécurité anti-arrondi
  if (h < 260) h = 260;
  wrap.style.height = h + 'px';
}
function fcBindResizeHandlers() {
  if (fcResizeHandlersBound) return;
  fcResizeHandlersBound = true;
  window.addEventListener('resize', fcResizeWrap);
  window.addEventListener('orientationchange', () => setTimeout(fcResizeWrap, 60));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fcResizeWrap);
  if (typeof window.showPage === 'function') {
    const _fcOrigShowPage = window.showPage;
    window.showPage = function (id, btn) {
      const r = _fcOrigShowPage.apply(this, arguments);
      if (id === 'ami') requestAnimationFrame(fcResizeWrap);
      return r;
    };
  }
}

function fcInit() {
  if (!currentUser || fcInitDone) return;
  fcInitDone = true;
  fcInjectStyles();
  fcInjectMarkup();
  fcInjectModals();
  fcInjectReactPicker();
  fcUpdateNavBadge();
  fcBindResizeHandlers();
  fcResizeWrap();
  fcPublishProfile();
  fcSyncReadStateFromCloud().then(fcLoadContacts);
  fcRegisterServiceWorker().then(fcRenderPushButton);
  fcArmAutoPushPrompt();
  fcStartRealtime();
}
function fcReset() {
  fcInitDone = false;
  fcStopRealtime();
  fcContacts = [];
  fcMessages = [];
  fcActiveFriendId = null;
  fcActivityMap = {};
  fcLastMsgMap = {};
  fcUnreadCounts = {};
  fcReactionsMap = {};
  fcReactPickerTargetId = null;
  fcSetupNoticeShown = false;
  const wrap = document.getElementById('fcWrap');
  if (wrap) wrap.remove();
  ['fcAddModal', 'fcTradeModal', 'fcReactPicker'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  document.querySelectorAll('.fc-nav-badge').forEach((el) => el.remove());
}

// ══ Intégration à l'éditeur de thème existant (page Paramètres) ══
// Mêmes valeurs que celles utilisées par défaut ci-dessus (color-mix résolu
// en hexadécimal statique) : la fenêtre garde exactement son apparence
// actuelle tant que rien n'est personnalisé.
const FC_THEME_DEFAULTS = {
  '--fc-bubble-mine-bg': '#14332d',
  '--fc-bubble-theirs-bg': '#111827',
  '--fc-bubble-theirs-border': '#1e2d45',
  '--fc-bubble-text': '#e2e8f0',
  '--fc-time-color': '#64748b',
  '--fc-sidebar-bg': '#111827',
  '--fc-contact-active-bg': '#123d38',
  '--fc-add-btn-color': '#00e5a0',
  '--fc-icon-color': '#64748b',
  '--fc-send-color': '#00e5a0',
  '--fc-wave-color': '#00e5a0',
  '--fc-rec-dot-color': '#ef4444',
  '--fc-cancel-color': '#ef4444',
  '--fc-audio-play-bg': '#00e5a0',
  '--fc-audio-fill-color': '#00e5a0',
  '--fc-trade-head-bg': '#111827',
  '--fc-trade-pos-color': '#00e5a0',
  '--fc-trade-neg-color': '#ef4444',
  '--fc-trade-chip-bg': '#111827',
  '--fc-react-trigger-bg': '#111827',
  '--fc-react-badge-bg': '#161d2e',
  '--fc-unread-dot-color': '#ef4444',
};
function fcEnsureThemeDefaults() {
  Object.entries(FC_THEME_DEFAULTS).forEach(([vn, def]) => {
    if (
      (typeof teVals !== 'undefined' ? teVals[vn] : undefined) === undefined &&
      !document.documentElement.style.getPropertyValue(vn)
    ) {
      document.documentElement.style.setProperty(vn, def);
    }
  });
}
function fcBuildThemeVars() {
  return [
    {
      v: '--fc-bubble-mine-bg',
      l: 'Bulle envoyée — fond',
      page: 'Ami',
      section: 'Bulles de message',
    },
    {
      v: '--fc-bubble-theirs-bg',
      l: 'Bulle reçue — fond',
      page: 'Ami',
      section: 'Bulles de message',
    },
    {
      v: '--fc-bubble-theirs-border',
      l: 'Bulle reçue — bordure',
      page: 'Ami',
      section: 'Bulles de message',
    },
    { v: '--fc-bubble-text', l: 'Texte des messages', page: 'Ami', section: 'Bulles de message' },
    { v: '--fc-time-color', l: 'Heure des messages', page: 'Ami', section: 'Bulles de message' },
    {
      v: '--fc-sidebar-bg',
      l: 'Fond de la liste de contacts',
      page: 'Ami',
      section: 'Contacts & interface',
    },
    {
      v: '--fc-contact-active-bg',
      l: 'Contact sélectionné',
      page: 'Ami',
      section: 'Contacts & interface',
    },
    {
      v: '--fc-add-btn-color',
      l: 'Bouton "+" ajouter un ami',
      page: 'Ami',
      section: 'Contacts & interface',
    },
    {
      v: '--fc-icon-color',
      l: 'Icônes (trombone, micro...)',
      page: 'Ami',
      section: 'Contacts & interface',
    },
    { v: '--fc-wave-color', l: "Barres de l'onde vocale", page: 'Ami', section: 'Micro & vocal' },
    { v: '--fc-rec-dot-color', l: "Point d'enregistrement", page: 'Ami', section: 'Micro & vocal' },
    {
      v: '--fc-cancel-color',
      l: 'Bouton annuler (corbeille)',
      page: 'Ami',
      section: 'Micro & vocal',
    },
    {
      v: '--fc-send-color',
      l: 'Icône envoyer / micro actif',
      page: 'Ami',
      section: 'Micro & vocal',
    },
    {
      v: '--fc-audio-play-bg',
      l: 'Bouton lecture des vocaux',
      page: 'Ami',
      section: 'Micro & vocal',
    },
    {
      v: '--fc-audio-fill-color',
      l: 'Progression des vocaux',
      page: 'Ami',
      section: 'Micro & vocal',
    },
    {
      v: '--fc-trade-head-bg',
      l: 'En-tête de la fiche',
      page: 'Ami',
      section: 'Fiche de trade partagée',
    },
    {
      v: '--fc-trade-pos-color',
      l: 'Résultat positif',
      page: 'Ami',
      section: 'Fiche de trade partagée',
    },
    {
      v: '--fc-trade-neg-color',
      l: 'Résultat négatif',
      page: 'Ami',
      section: 'Fiche de trade partagée',
    },
    {
      v: '--fc-trade-chip-bg',
      l: 'Étiquettes (TF / confluences)',
      page: 'Ami',
      section: 'Fiche de trade partagée',
    },
    { v: '--fc-react-trigger-bg', l: 'Bouton réagir', page: 'Ami', section: 'Réactions' },
    { v: '--fc-react-badge-bg', l: 'Pastille de réaction', page: 'Ami', section: 'Réactions' },
    {
      v: '--fc-unread-dot-color',
      l: 'Point de notification (message non lu)',
      page: 'Ami',
      section: 'Contacts & interface',
    },
  ];
}
if (typeof window.buildTV === 'function') {
  const _fcOrigBuildTV = window.buildTV;
  window.buildTV = function () {
    fcEnsureThemeDefaults();
    return _fcOrigBuildTV().concat(fcBuildThemeVars());
  };
}

// ══ Surcharges (wrapping) — n'édite aucune fonction existante ══
if (typeof window.afterPinValidated === 'function') {
  const _fcOrigAfterPinValidated = window.afterPinValidated;
  window.afterPinValidated = async function () {
    const r = await _fcOrigAfterPinValidated.apply(this, arguments);
    try {
      fcInit();
    } catch (e) {
      console.warn('fcInit:', e);
    }
    return r;
  };
}
if (typeof window.saveProfile === 'function') {
  const _fcOrigSaveProfile = window.saveProfile;
  window.saveProfile = function () {
    const r = _fcOrigSaveProfile.apply(this, arguments);
    try {
      fcPublishProfile();
      fcRenderContactList();
    } catch (e) {}
    return r;
  };
}
if (typeof window._doResetPin === 'function') {
  const _fcOrigDoResetPin = window._doResetPin;
  window._doResetPin = async function () {
    try {
      fcReset();
    } catch (e) {}
    return _fcOrigDoResetPin.apply(this, arguments);
  };
}
