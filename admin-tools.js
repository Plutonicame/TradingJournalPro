// ═══════════════════════════════════════════════════════════════════════
// OUTILS ADMIN — TJP · module additif
// ═══════════════════════════════════════════════════════════════════════
// 1) Bouton « Conditions d'utilisation » tout en bas de la page Paramètres.
// 2) Badge « (admin) » à côté du pseudo de l'administrateur dans Amis (liste
//    de contacts, en-tête de conversation, résultats de recherche) — même
//    couleur que le pseudo, sans le gras.
// 3) Réinitialisation du code PIN d'un ami par l'administrateur, depuis
//    l'en-tête de sa conversation. L'administrateur n'a JAMAIS accès au PIN
//    lui-même (ancien ou nouveau) : il efface seulement l'actuel côté
//    serveur, l'utilisateur en redéfinit un à sa prochaine connexion Google.
//
// « Qui est admin » et « le PIN est bien réinitialisé » sont toujours
// vérifiés côté serveur (fonctions SQL tjp_admin_user_id / tjp_admin_reset_pin,
// qui comparent l'e-mail du jeton de connexion) — rien ici ne donne de droit
// à lui seul, ce fichier ne fait qu'afficher ce que le serveur autorise déjà.

function openCguModal() {
  const m = document.getElementById('cguModal');
  if (m) m.classList.add('open');
}

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

// ── En-tête de conversation : badge + bouton réinitialisation du PIN ──
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
      tjpRenderResetPinBtn(friendId);
    });
  };
}
function tjpRenderResetPinBtn(friendId) {
  let btn = document.getElementById('tjpResetPinBtn');
  const show = tjpIsCurrentUserAdmin() && friendId && friendId !== currentUser.id;
  if (!show) {
    if (btn) btn.style.display = 'none';
    return;
  }
  if (!btn) {
    const header = document.querySelector('.fc-chat-header');
    if (!header) return;
    btn = document.createElement('button');
    btn.id = 'tjpResetPinBtn';
    btn.type = 'button';
    btn.title = 'Réinitialiser son code PIN (il en redéfinira un à sa prochaine connexion)';
    btn.style.cssText =
      'margin-left:auto;background:transparent;border:1px solid var(--border,#1e2a3a);border-radius:5px;color:var(--muted);font-family:var(--mono);font-size:9px;padding:4px 8px;cursor:pointer;flex-shrink:0;white-space:nowrap;';
    btn.textContent = 'Réinitialiser le PIN';
    header.appendChild(btn);
  }
  btn.style.display = '';
  btn.onclick = function () {
    tjpConfirmResetPin(friendId);
  };
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
    if (typeof showSync === 'function') showSync('✓ Code PIN réinitialisé', '#22c55e');
  } catch (e) {
    console.warn('tjpDoResetPin:', e);
    if (typeof showSync === 'function') showSync('⚠ Réinitialisation impossible', '#ef4444');
    else alert('Réinitialisation impossible.');
  }
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
