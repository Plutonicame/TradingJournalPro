// ═══════════════════════════════════════════════════════════════════════
// OUTILS ADMIN — TJP · module additif
// ═══════════════════════════════════════════════════════════════════════
// 1) Badge « (admin) » à côté du pseudo de l'administrateur dans Amis.
// 2) Entrée « Affichage » tout en bas du menu « Mode d'affichage »
//    (Paramètres → Préférences), visible uniquement sur le compte admin.
// 3) Liste des utilisateurs (nom, photo, en ligne/hors ligne).
// 4) Pop-up par utilisateur avec onglets : Infos, Réinitialiser le mot de
//    passe, Ban, et un onglet « Prise de contrôle » qui n'est qu'un
//    emplacement réservé dans la mise en page — aucune action derrière.
// 5) Écran affiché à un utilisateur banni (motif + compte à rebours).
//
// « Qui est admin », « qui est banni » et toutes les actions ci-dessus
// sont vérifiées et exécutées côté serveur (fonctions SQL tjp_admin_*,
// qui comparent l'e-mail du jeton de connexion) — ce fichier n'affiche
// que ce que le serveur autorise déjà.

// ── Identité admin (mise en cache après le premier appel réussi) ──
let _tjpAdminId = null;
let _tjpAdminIdPromise = null;
function tjpGetAdminId() {
  if (_tjpAdminId) return Promise.resolve(_tjpAdminId);
  if (_tjpAdminIdPromise) return _tjpAdminIdPromise;
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser)
    return Promise.resolve(null);
  _tjpAdminIdPromise = sb
    .rpc('tjp_admin_user_id')
    .then(({data, error}) => {
      if (!error && data) _tjpAdminId = data;
      _tjpAdminIdPromise = null;
      return _tjpAdminId;
    })
    .catch(() => {
      _tjpAdminIdPromise = null;
      return null;
    });
  return _tjpAdminIdPromise;
}
function tjpIsCurrentUserAdmin() {
  return !!(
    currentUser &&
    currentUser.email &&
    currentUser.email.toLowerCase() === 'paulolasko@gmail.com'
  );
}
function tjpAddBadge(el) {
  if (!el || el.querySelector('.tjp-admin-badge')) return;
  el.insertAdjacentHTML(
    'beforeend',
    ' <span class="tjp-admin-badge" style="color:inherit;font-weight:normal;">(admin)</span>'
  );
}

// ── Liste de contacts : badge après le pseudo du contact admin ──
const _tjpOrigFcRenderContactList = window.fcRenderContactList;
if (typeof _tjpOrigFcRenderContactList === 'function') {
  window.fcRenderContactList = function () {
    _tjpOrigFcRenderContactList();
    tjpGetAdminId().then(adminId => {
      if (!adminId) return;
      document.querySelectorAll('.fc-contact-item').forEach(el => {
        if (el.dataset.friendId === adminId) tjpAddBadge(el.querySelector('.fc-contact-name'));
      });
    });
  };
}
// ── En-tête de conversation : badge après le pseudo admin ──
const _tjpOrigFcOpenConversation = window.fcOpenConversation;
if (typeof _tjpOrigFcOpenConversation === 'function') {
  window.fcOpenConversation = function (friendId) {
    _tjpOrigFcOpenConversation(friendId);
    tjpGetAdminId().then(adminId => {
      const pseudoEl = document.getElementById('fcChatPseudo');
      if (pseudoEl) {
        const old = pseudoEl.querySelector('.tjp-admin-badge');
        if (old) old.remove();
        if (adminId && friendId === adminId) tjpAddBadge(pseudoEl);
      }
    });
  };
}
// ── Résultats de recherche (ajout d'ami) : badge après le pseudo admin ──
const _tjpOrigFcRunPseudoSearch = window.fcRunPseudoSearch;
if (typeof _tjpOrigFcRunPseudoSearch === 'function') {
  window.fcRunPseudoSearch = async function (...args) {
    await _tjpOrigFcRunPseudoSearch(...args);
    const adminId = await tjpGetAdminId();
    if (!adminId) return;
    document.querySelectorAll('.fc-result-item').forEach(el => {
      const addBtn = el.querySelector('.fc-result-add-btn[data-user-id]');
      if (addBtn && addBtn.dataset.userId === adminId) tjpAddBadge(el.querySelector('.fc-result-name'));
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Entrée « Affichage » tout en bas du menu « Mode d'affichage ».
// ═══════════════════════════════════════════════════════════════════════
const _tjpOrigCfEnsureNavToggleCard = window.cfEnsureNavToggleCard;
if (typeof _tjpOrigCfEnsureNavToggleCard === 'function') {
  window.cfEnsureNavToggleCard = function (...args) {
    _tjpOrigCfEnsureNavToggleCard(...args);
    tjpInjectAffichageOption();
  };
}
function tjpInjectAffichageOption() {
  if (!tjpIsCurrentUserAdmin()) return;
  const sel = document.getElementById('cfModeOverrideSel');
  if (!sel) return;
  if (!sel.querySelector('option[value="tjpAffichage"]')) {
    const opt = document.createElement('option');
    opt.value = 'tjpAffichage';
    opt.textContent = 'Affichage';
    sel.appendChild(opt);
  }
  if (!sel.dataset.tjpBound) {
    sel.dataset.tjpBound = '1';
    const realHandler = sel.onchange;
    sel.onchange = null;
    sel.addEventListener('change', function () {
      if (sel.value === 'tjpAffichage') {
        tjpOpenUserList();
        const real = typeof APP !== 'undefined' && APP.screenModeOverride && APP.screenModeOverride !== 'tjpAffichage' ? APP.screenModeOverride : 'auto';
        sel.value = real;
      } else if (realHandler) {
        realHandler.call(sel);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Liste des utilisateurs.
// ═══════════════════════════════════════════════════════════════════════
function tjpInitials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}
function tjpAvatarHtml(name, photoUrl, size) {
  const s = size || 36;
  if (photoUrl) {
    return `<img src="${photoUrl}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;flex-shrink:0;">`;
  }
  return `<div style="width:${s}px;height:${s}px;border-radius:50%;background:var(--border,#1e2a3a);display:flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.36)}px;color:var(--muted);flex-shrink:0;">${tjpInitials(name)}</div>`;
}
async function tjpOpenUserList() {
  let el = document.getElementById('tjpUserListModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tjpUserListModal';
    el.className = 'cp-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="cp-modal" style="width:360px;max-height:70vh;overflow-y:auto;">' +
    '<div class="cp-title">UTILISATEURS</div>' +
    '<div id="tjpUserListBody" style="font-size:12px;color:var(--muted);padding:10px 0;">Chargement…</div>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
    '<button class="btn btn-g" onclick="document.getElementById(\'tjpUserListModal\').classList.remove(\'open\')">FERMER</button>' +
    '</div></div>';
  el.classList.add('open');
  try {
    const {data, error} = await sb.rpc('tjp_admin_list_users');
    if (error) throw error;
    const body = document.getElementById('tjpUserListBody');
    if (!data || !data.length) {
      body.textContent = 'Aucun autre utilisateur.';
      return;
    }
    body.innerHTML = data
      .map(
        u => `
      <div class="tjp-user-row" data-uid="${u.user_id}" style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-radius:6px;cursor:pointer;">
        ${tjpAvatarHtml(u.name, u.photo_url, 32)}
        <span style="flex:1;color:var(--text);font-size:13px;">${(u.name || '').replace(/</g, '&lt;')}</span>
        ${u.banned_until ? '<span style="font-size:9px;color:#ef4444;border:1px solid #ef4444;border-radius:3px;padding:1px 5px;">BANNI</span>' : ''}
        <span title="${u.online ? 'En ligne' : 'Hors ligne'}" style="width:8px;height:8px;border-radius:50%;background:${u.online ? '#22c55e' : '#55607a'};flex-shrink:0;"></span>
      </div>`
      )
      .join('');
    body.querySelectorAll('.tjp-user-row').forEach(row => {
      row.onmouseenter = () => (row.style.background = 'rgba(255,255,255,.04)');
      row.onmouseleave = () => (row.style.background = '');
      row.onclick = () => tjpOpenUserInfo(row.dataset.uid);
    });
  } catch (e) {
    console.warn('tjpOpenUserList:', e);
    const body = document.getElementById('tjpUserListBody');
    if (body) body.textContent = 'Impossible de charger la liste.';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Pop-up utilisateur : onglets Infos / Réinitialiser / Ban / Prise de contrôle.
// ═══════════════════════════════════════════════════════════════════════
let _tjpInfoCache = null;
let _tjpInfoTab = null; // null = aucun onglet ouvert, on voit la zone réservée
let _tjpMenuOpen = false;
async function tjpOpenUserInfo(uid) {
  _tjpInfoTab = null;
  _tjpMenuOpen = false;
  let el = document.getElementById('tjpUserInfoModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tjpUserInfoModal';
    el.className = 'cp-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="cp-modal" style="width:92vw;max-width:1500px;height:88vh;padding:0;display:flex;flex-direction:column;"><div style="margin:auto;font-size:12px;color:var(--muted);">Chargement…</div></div>';
  el.classList.add('open');
  try {
    const {data, error} = await sb.rpc('tjp_admin_user_info', {uid});
    if (error || !data) throw error || new Error('Introuvable');
    _tjpInfoCache = data;
    tjpRenderUserInfo();
  } catch (e) {
    console.warn('tjpOpenUserInfo:', e);
    const box = el.querySelector('.cp-modal');
    if (box) box.innerHTML = '<div style="margin:auto;font-size:12px;color:#ef4444;">Impossible de charger ce compte.</div>';
  }
}
const TJP_MENU_ITEMS = [
  ['infos', 'Infos'],
  ['reset', 'Mot de passe'],
  ['ban', 'Ban']
];
function tjpRenderUserInfo() {
  const d = _tjpInfoCache;
  const el = document.getElementById('tjpUserInfoModal');
  if (!el || !d) return;
  const menuItemsHtml = TJP_MENU_ITEMS.map(
    t =>
      `<div class="tjp-menu-item" data-tab="${t[0]}" style="padding:9px 16px;font-size:12px;color:var(--text);cursor:pointer;border-radius:6px;white-space:nowrap;">${t[1]}</div>`
  ).join('');
  el.innerHTML =
    '<div class="cp-modal" style="width:92vw;max-width:1500px;height:88vh;padding:0;display:flex;flex-direction:column;overflow:hidden;">' +
    // ── Bandeau façon navigateur ──
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-bottom:1px solid var(--card-header-borderbott,var(--border,#1e2a3a));background:var(--card-header-background,rgba(255,255,255,.02));border-radius:10px 10px 0 0;flex-shrink:0;">' +
    `<div style="display:flex;align-items:center;gap:10px;min-width:0;">${tjpAvatarHtml(d.name, d.photo_url, 30)}` +
    `<span style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(d.name || '').replace(/</g, '&lt;')}</span>` +
    `<span title="${d.online ? 'En ligne' : 'Hors ligne'}" style="width:8px;height:8px;border-radius:50%;background:${d.online ? '#22c55e' : '#55607a'};flex-shrink:0;"></span></div>` +
    '<div style="position:relative;flex-shrink:0;">' +
    '<button id="tjpMenuBtn" class="btn btn-g" style="display:flex;align-items:center;gap:6px;">MENU <span style="font-size:8px;">▾</span></button>' +
    `<div id="tjpMenuDropdown" style="display:${_tjpMenuOpen ? 'block' : 'none'};position:absolute;top:calc(100% + 4px);right:0;background:var(--cp-modal-background,#10141f);border:1px solid var(--cp-modal-border,var(--border,#1e2a3a));border-radius:8px;padding:5px;min-width:150px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.35);">${menuItemsHtml}</div>` +
    '</div>' +
    '</div>' +
    // ── Zone principale : grand carré = aperçu / contenu de l'onglet choisi ──
    `<div id="tjpBigSquare" style="flex:1;margin:16px;border-radius:10px;overflow-y:auto;background:var(--card-header-background,rgba(255,255,255,.02));border:1px dashed var(--border,#1e2a3a);display:flex;">${tjpBigSquareHtml(d)}</div>` +
    '<div style="display:flex;justify-content:flex-end;padding:10px 16px;flex-shrink:0;">' +
    '<button class="btn btn-g" onclick="document.getElementById(\'tjpUserInfoModal\').classList.remove(\'open\')">FERMER</button>' +
    '</div></div>';
  document.getElementById('tjpMenuBtn').onclick = () => {
    _tjpMenuOpen = !_tjpMenuOpen;
    tjpRenderUserInfo();
  };
  el.querySelectorAll('.tjp-menu-item').forEach(it => {
    it.onmouseenter = () => (it.style.background = 'rgba(255,255,255,.06)');
    it.onmouseleave = () => (it.style.background = '');
    it.onclick = () => {
      _tjpInfoTab = it.dataset.tab;
      _tjpMenuOpen = false;
      tjpRenderUserInfo();
    };
  });
  tjpBindTabHandlers(d.user_id);
}
function tjpBigSquareHtml(d) {
  if (!_tjpInfoTab) {
    return (
      '<div style="margin:auto;text-align:center;color:var(--muted);font-size:12px;padding:24px;">' +
      `L'écran de ${(d.name || '').replace(/</g, '&lt;')} s'afficherait ici si cette fonctionnalité est activée.<br><br>` +
      'Choisis un onglet dans le menu en haut à droite pour consulter ses informations.</div>'
    );
  }
  return `<div style="padding:22px;width:100%;">${tjpTabBodyHtml(d)}</div>`;
}
function tjpFmtDate(x) {
  if (!x) return '—';
  const d = new Date(x);
  if (isNaN(d)) return '—';
  const p2 = n => (n < 10 ? '0' : '') + n;
  return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}
function tjpTabBodyHtml(d) {
  if (_tjpInfoTab === 'infos') {
    const accountsHtml = (d.accounts || [])
      .map(a => `<li>${(a.name || 'Compte').replace(/</g, '&lt;')} — ${a.capital != null ? a.capital : '—'}</li>`)
      .join('');
    return `
      <div style="font-size:12px;color:var(--text);line-height:1.8;">
        <div><b>E-mail :</b> ${d.email || '—'}</div>
        <div><b>Arrivée sur TJP :</b> ${tjpFmtDate(d.created_at)}</div>
        <div><b>Dernière connexion :</b> ${tjpFmtDate(d.last_sign_in)}</div>
        <div><b>Vu pour la dernière fois :</b> ${tjpFmtDate(d.last_seen)}</div>
        <div style="margin-top:8px;"><b>Comptes de trading :</b></div>
        <ul style="margin:4px 0 0 18px;padding:0;">${accountsHtml || '<li>Aucun</li>'}</ul>
      </div>`;
  }
  if (_tjpInfoTab === 'reset') {
    return `
      <div style="font-size:12px;color:var(--text);line-height:1.6;">
        Réinitialise son code PIN. Tu ne verras jamais ni l'ancien ni le nouveau : il en redéfinira un à sa prochaine connexion Google.
        <div style="margin-top:10px;">
          <button id="tjpResetPinBtn" class="btn btn-d">RÉINITIALISER LE MOT DE PASSE</button>
        </div>
      </div>`;
  }
  if (_tjpInfoTab === 'ban') {
    const isBanned = !!d.banned_until;
    return `
      <div style="font-size:12px;color:var(--text);">
        ${isBanned ? `<div style="margin-bottom:10px;color:#ef4444;">Actuellement banni jusqu'au ${tjpFmtDate(d.banned_until)}.</div>` : ''}
        <div style="display:flex;align-items:flex-end;gap:8px;">
          <div class="fg" style="width:70px;"><label>Nombre</label><input type="number" id="tjpBanN" min="1" step="1" value="1"></div>
          <div class="fg" style="flex:1;"><label>Unité</label><select id="tjpBanUnit">${TJP_BAN_UNITS.map(u => '<option value="' + u[0] + '">' + u[1] + '</option>').join('')}</select></div>
          <button id="tjpBanConfirmBtn" title="Valider le ban" style="flex-shrink:0;background:transparent;border:1px solid var(--border,#1e2a3a);border-radius:6px;color:#22c55e;width:34px;height:34px;cursor:pointer;font-size:16px;">✓</button>
        </div>
        <div class="fg" style="margin-top:10px;"><label>Motif (facultatif)</label><textarea id="tjpBanReasonInput" rows="3" style="width:100%;resize:vertical;font-family:var(--mono);font-size:12px;">${isBanned && d.ban_reason ? d.ban_reason.replace(/</g, '&lt;') : ''}</textarea></div>
        ${isBanned ? '<button id="tjpUnbanBtn" class="btn btn-g" style="color:#ef4444;margin-top:10px;">DÉBAN</button>' : ''}
      </div>`;
  }
  return '';
}
function tjpBindTabHandlers(uid) {
  const resetBtn = document.getElementById('tjpResetPinBtn');
  if (resetBtn) resetBtn.onclick = () => tjpConfirmResetPin(uid);
  const confirmBtn = document.getElementById('tjpBanConfirmBtn');
  if (confirmBtn) confirmBtn.onclick = () => tjpDoBan(uid);
  const unbanBtn = document.getElementById('tjpUnbanBtn');
  if (unbanBtn) unbanBtn.onclick = () => tjpDoUnban(uid);
}
function tjpConfirmResetPin(uid) {
  const go = () => tjpDoResetPin(uid);
  if (typeof showConfirm === 'function') {
    showConfirm(
      'Réinitialiser le PIN',
      "Son code PIN actuel sera effacé. Il devra en redéfinir un nouveau à sa prochaine connexion Google. Tu ne verras jamais ni l'ancien ni le nouveau PIN.",
      go
    );
  } else if (confirm('Réinitialiser le code PIN de cet utilisateur ?')) {
    go();
  }
}
async function tjpDoResetPin(uid) {
  try {
    const {error} = await sb.rpc('tjp_admin_reset_pin', {uid});
    if (error) throw error;
    if (typeof showSync === 'function') showSync('✓ Mot de passe réinitialisé', '#22c55e');
  } catch (e) {
    console.warn('tjpDoResetPin:', e);
    if (typeof showSync === 'function') showSync('⚠ Réinitialisation impossible', '#ef4444');
  }
}
const TJP_BAN_UNITS = [
  ['min', 'minute(s)', 60],
  ['h', 'heure(s)', 3600],
  ['j', 'jour(s)', 86400],
  ['mois', 'mois', 30 * 86400],
  ['an', 'année(s)', 365 * 86400]
];
async function tjpDoBan(uid) {
  const n = parseInt(document.getElementById('tjpBanN').value, 10);
  const unitKey = document.getElementById('tjpBanUnit').value;
  const reason = document.getElementById('tjpBanReasonInput').value.trim();
  const unit = TJP_BAN_UNITS.find(u => u[0] === unitKey);
  if (!n || n <= 0 || !unit) return;
  const untilTs = new Date(Date.now() + n * unit[2] * 1000).toISOString();
  try {
    const {error} = await sb.rpc('tjp_admin_ban', {uid, until_ts: untilTs, reason: reason || null});
    if (error) throw error;
    if (typeof showSync === 'function') showSync('✓ Compte banni', '#22c55e');
    tjpOpenUserInfo(uid);
  } catch (e) {
    console.warn('tjpDoBan:', e);
    if (typeof showSync === 'function') showSync('⚠ Ban impossible', '#ef4444');
  }
}
async function tjpDoUnban(uid) {
  try {
    const {error} = await sb.rpc('tjp_admin_unban', {uid});
    if (error) throw error;
    if (typeof showSync === 'function') showSync('✓ Compte débanni', '#22c55e');
    tjpOpenUserInfo(uid);
  } catch (e) {
    console.warn('tjpDoUnban:', e);
    if (typeof showSync === 'function') showSync('⚠ Déban impossible', '#ef4444');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Écran affiché à un utilisateur banni (vérifié à chaque connexion, puis
// toutes les 5 s). Bloqué aussi côté serveur (RLS) — ceci n'est que
// l'affichage.
// ═══════════════════════════════════════════════════════════════════════
let _tjpBanInterval = null;
function tjpFmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p2 = n => (n < 10 ? '0' : '') + n;
  return (days > 0 ? days + 'j ' : '') + p2(h) + ':' + p2(m) + ':' + p2(sec);
}
function tjpShowBanScreen(untilMs, reason, byName, serverOffsetMs) {
  let el = document.getElementById('tjpBanScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tjpBanScreen';
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;' +
      'background:var(--ban-bg,rgba(8,10,16,.85));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font-family:var(--mono,monospace);';
    el.innerHTML =
      '<div style="font-size:16px;font-weight:600;color:var(--ban-title,#ef4444);">Vous avez été banni par <span id="tjpBanByName"></span></div>' +
      '<div style="font-size:13px;color:var(--ban-tx,#c7d2e4);">Votre compte sera disponible dans :</div>' +
      '<div id="tjpBanCountdown" style="font-size:34px;font-weight:700;color:var(--ban-count,#ef4444);letter-spacing:1px;"></div>' +
      '<div id="tjpBanReason" style="display:none;max-width:420px;font-size:12px;color:var(--ban-tx,#c7d2e4);background:rgba(255,255,255,.04);border:1px solid var(--border,#1e2a3a);border-radius:6px;padding:10px 14px;margin-top:4px;white-space:pre-line;"></div>' +
      '<button id="tjpBanLogoutBtn" style="margin-top:18px;background:var(--ban-out-bg,transparent);border:1px solid var(--ban-out-bd,#ef4444);color:var(--ban-out-tx,#ef4444);font-family:var(--mono,monospace);font-size:12px;padding:8px 18px;border-radius:6px;cursor:pointer;">Déconnexion</button>';
    document.body.appendChild(el);
    document.getElementById('tjpBanLogoutBtn').onclick = function () {
      if (typeof resetPin === 'function') resetPin();
    };
  }
  document.getElementById('tjpBanByName').textContent = byName || "l'administrateur";
  const reasonEl = document.getElementById('tjpBanReason');
  if (reason && reason.trim()) {
    reasonEl.textContent = reason;
    reasonEl.style.display = 'block';
  } else {
    reasonEl.style.display = 'none';
  }
  if (_tjpBanInterval) clearInterval(_tjpBanInterval);
  function tick() {
    const remaining = untilMs - (Date.now() + serverOffsetMs);
    const cd = document.getElementById('tjpBanCountdown');
    if (!cd) {
      clearInterval(_tjpBanInterval);
      return;
    }
    if (remaining <= 0) {
      clearInterval(_tjpBanInterval);
      tjpHideBanScreen();
      if (typeof _tjpOrigAfterPinValidated === 'function') _tjpOrigAfterPinValidated();
      return;
    }
    cd.textContent = tjpFmtCountdown(remaining);
  }
  tick();
  _tjpBanInterval = setInterval(tick, 1000);
}
function tjpHideBanScreen() {
  const el = document.getElementById('tjpBanScreen');
  if (el) el.remove();
}
async function tjpCheckBanAndMaybeShow() {
  try {
    const {data, error} = await sb.rpc('tjp_heartbeat');
    if (error || !data) return false;
    if (data.banned_until && data.banned_until > data.now) {
      tjpShowBanScreen(data.banned_until, data.ban_reason, data.banned_by_name, data.now - Date.now());
      return true;
    }
  } catch (e) {
    console.warn('tjpCheckBanAndMaybeShow:', e);
  }
  return false;
}

// ── Présence (toutes les 5 s) + relance du contrôle de ban pendant l'usage ──
let _tjpHeartbeatTimer = null;
function tjpStartHeartbeatLoop() {
  if (_tjpHeartbeatTimer) return;
  _tjpHeartbeatTimer = setInterval(async () => {
    try {
      const {data} = await sb.rpc('tjp_heartbeat');
      if (data && data.banned_until && data.banned_until > data.now) {
        clearInterval(_tjpHeartbeatTimer);
        _tjpHeartbeatTimer = null;
        tjpShowBanScreen(data.banned_until, data.ban_reason, data.banned_by_name, data.now - Date.now());
      }
    } catch (e) {}
  }, 5000);
}

// ── Branchement sur la connexion réussie (après code PIN) ──
const _tjpOrigAfterPinValidated = window.afterPinValidated;
if (typeof _tjpOrigAfterPinValidated === 'function') {
  window.afterPinValidated = async function (...args) {
    const banned = await tjpCheckBanAndMaybeShow();
    if (banned) return;
    await _tjpOrigAfterPinValidated(...args);
    tjpStartHeartbeatLoop();
  };
}
