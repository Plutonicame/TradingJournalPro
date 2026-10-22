// (SUPABASE_URL, SUPABASE_KEY et sb définis dans le premier bloc script)

let currentUser = null;
let syncTimeout = null;

function showOverlay(id) {
  document.querySelectorAll('.auth-overlay').forEach(el => el.classList.remove('active'));
  if (id) document.getElementById(id).classList.add('active');
}

// ══ GOOGLE LOGIN ══

// ══ PIN — sécurisé ══
// Le PIN n'est plus jamais stocké ni comparé en clair :
//  • En local, on ne garde qu'un hash (SHA-256), utilisé pour un déverrouillage
//    RAPIDE quand cet appareil a déjà une vraie session Supabase valide (comme
//    un code de verrouillage d'écran : l'identité est déjà prouvée, le PIN ne
//    fait que reverrouiller l'accès physique à l'app sur CET appareil).
//  • Sur un appareil qui n'a PAS de session valide (nouveau téléphone, etc.),
//    le PIN est vérifié côté serveur (Edge Function pin-auth) qui renvoie un
//    jeton permettant d'obtenir une VRAIE session Supabase — jamais un compte
//    fabriqué localement comme avant.
function pinKey(uid) {
  return 'tjp_pin_' + uid;
}
function emailKey(uid) {
  return 'tjp_email_' + uid;
}
function uidByEmailKey(email) {
  return 'tjp_uid_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

const PIN_AUTH_ENDPOINT = 'https://ghjashqgwlaofjubzrcp.supabase.co/functions/v1/pin-auth';

async function localPinHash(pin, uid) {
  const enc = new TextEncoder().encode('tjp_pin_v1:' + uid + ':' + pin);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function callPinAuth(payload, accessToken) {
  const res = await fetch(PIN_AUTH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (accessToken || PC_SUPABASE_ANON_KEY)
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Erreur serveur (' + res.status + ')');
  return data;
}

// Essais de PIN ratés, conservés d'un chargement de page à l'autre (avant, un
// simple rechargement remettait le compteur à 0 : les 5 essais étaient sans
// limite réelle). Fenêtre de 15 minutes. Le verrou côté serveur reste
// indispensable pour la reconnexion sur un appareil sans session.
const PIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
function pinFailKey(uid) {
  return 'tjp_pin_fail_' + uid;
}
function pinFailRead(uid) {
  try {
    const o = JSON.parse(localStorage.getItem(pinFailKey(uid)) || 'null');
    if (o && Date.now() - o.t < PIN_FAIL_WINDOW_MS) return o.n || 0;
  } catch (e) {}
  return 0;
}
function pinFailAdd(uid) {
  const n = pinFailRead(uid) + 1;
  try {
    localStorage.setItem(pinFailKey(uid), JSON.stringify({n: n, t: Date.now()}));
  } catch (e) {}
  return n;
}
function pinFailClear(uid) {
  try {
    localStorage.removeItem(pinFailKey(uid));
  } catch (e) {}
}

// Un seul écouteur clavier PIN actif à la fois : chaque nouvel appel à buildPad()
// retire l'écouteur du pavé précédent avant d'attacher le sien (évite l'empilement
// et toute fuite d'un pavé PIN caché qui continuerait à intercepter des touches).
let _pinKeydownHandler = null;

function buildPad(padId, dotsId, onComplete, errId) {
  const pad = document.getElementById(padId);
  pad.innerHTML = '';
  let entry = '';
  const dots = document.getElementById(dotsId).querySelectorAll('.pin-dot');
  function update() {
    dots.forEach((d, i) => d.classList.toggle('filled', i < entry.length));
    if (entry.length === 4) setTimeout(() => onComplete(entry, reset), 150);
  }
  function reset(shake) {
    entry = '';
    dots.forEach(d => {
      d.classList.remove('filled');
      if (shake) {
        d.style.animation = 'none';
        d.offsetHeight;
        d.style.animation = 'shake .3s';
      }
    });
    const err = document.getElementById(errId);
    if (!shake && err) err.style.display = 'none';
  }
  function typeDigit(k) {
    if (entry.length < 4) {
      entry += k;
      update();
    }
  }
  function backspace() {
    if (entry.length > 0) {
      entry = entry.slice(0, -1);
      update();
    }
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'empty', '0', 'del'].forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'pin-btn' + (k === 'del' ? ' del' : k === 'empty' ? ' empty' : '');
    btn.textContent = k === 'del' ? '⌫' : k === 'empty' ? '' : k;
    if (k !== 'empty') btn.onclick = () => (k === 'del' ? backspace() : typeDigit(k));
    pad.appendChild(btn);
  });

  // Saisie au clavier physique (PC) : les mêmes chiffres sont acceptés, mais on
  // n'agit QUE sur `entry`/les points — jamais sur les boutons .pin-btn eux-mêmes.
  // Comme le bouton correspondant n'est ni cliqué ni focus, son état :active
  // (fond + zoom) ne se déclenche jamais : rien ne montre à l'écran quelle touche
  // a été tapée, pour rester utilisable en public sans risque de regard indiscret.
  if (_pinKeydownHandler) document.removeEventListener('keydown', _pinKeydownHandler);
  _pinKeydownHandler = e => {
    if (pad.offsetParent === null) return; // ce pavé n'est plus affiché
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      typeDigit(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      backspace();
    }
  };
  document.addEventListener('keydown', _pinKeydownHandler);
}

let pinFirstEntry = '';
function setupCreatePin() {
  pinFirstEntry = '';
  buildPad(
    'createPad',
    'createDots',
    (val, reset) => {
      pinFirstEntry = val;
      showOverlay('overlayConfirmPin');
      setupConfirmPin();
    },
    'createErr'
  );
}

function setupConfirmPin() {
  buildPad(
    'confirmPad',
    'confirmDots',
    async (val, reset) => {
      if (val === pinFirstEntry) {
        const err = document.getElementById('confirmErr');
        try {
          const localHash = await localPinHash(val, currentUser.id);
          localStorage.setItem(pinKey(currentUser.id), localHash);
          localStorage.setItem(emailKey(currentUser.id), currentUser.email);
          localStorage.setItem(uidByEmailKey(currentUser.email), currentUser.id);
          // Enregistrer aussi côté serveur (hash + sel, jamais le PIN en clair) —
          // sans ça, aucun autre appareil ne pourrait jamais se reconnecter avec ce PIN.
          const {data: sessionData} = await sb.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (!accessToken) throw new Error('Session absente');
          await callPinAuth({action: 'set', pin: val}, accessToken);
          afterPinValidated();
        } catch (e) {
          console.warn('Enregistrement PIN cloud échoué (reste utilisable sur cet appareil) :', e);
          afterPinValidated(); // ne bloque pas l'utilisateur pour un souci réseau ponctuel
          // Avant, cet échec restait invisible : tes autres appareils gardaient
          // l'ancien PIN sans que tu le saches.
          setTimeout(
            () =>
              alert(
                "Ton nouveau PIN est enregistré sur cet appareil, mais PAS encore sur le serveur (problème réseau). Sur tes autres appareils, l'ancien PIN reste valable. Refais « Changer le PIN » dès que le réseau revient."
              ),
            600
          );
        }
      } else {
        err.textContent = 'PIN non identique. Recommence.';
        err.style.display = 'block';
        reset(true);
        pinFirstEntry = '';
        setTimeout(() => {
          showOverlay('overlayCreatePin');
          setupCreatePin();
        }, 800);
      }
    },
    'confirmErr'
  );
}

// Déverrouillage RAPIDE (session déjà valide sur cet appareil) : vérif locale seulement.
let pinAttempts = 0;
function setupEnterPin() {
  pinAttempts = currentUser ? pinFailRead(currentUser.id) : 0;
  if (pinAttempts >= 5) {
    // Déjà 5 échecs récents (page rechargée entre-temps) : reconnexion exigée.
    setTimeout(() => resetPin(), 0);
    return;
  }
  buildPad(
    'enterPad',
    'enterDots',
    async (val, reset) => {
      const stored = localStorage.getItem(pinKey(currentUser.id));
      const attempt = await localPinHash(val, currentUser.id);
      // Migration silencieuse : si l'ancien PIN était encore stocké en clair (avant
      // ce correctif de sécurité) et correspond, on le fait passer au nouveau format
      // — en local ET côté serveur — sans rien demander de plus à l'utilisateur.
      const isLegacyMatch = stored === val;
      if (attempt === stored || isLegacyMatch) {
        pinAttempts = 0;
        pinFailClear(currentUser.id);
        if (isLegacyMatch) {
          try {
            localStorage.setItem(pinKey(currentUser.id), attempt);
            const {data: sessionData} = await sb.auth.getSession();
            const accessToken = sessionData?.session?.access_token;
            if (accessToken) await callPinAuth({action: 'set', pin: val}, accessToken);
          } catch (e) {
            console.warn(
              'Migration PIN vers le nouveau format échouée (réessaiera plus tard) :',
              e
            );
          }
        }
        afterPinValidated();
      } else {
        pinAttempts = pinFailAdd(currentUser.id);
        const err = document.getElementById('enterErr');
        if (pinAttempts >= 5) {
          err.textContent = 'Trop de tentatives. Reconnexion requise.';
          err.style.display = 'block';
          setTimeout(() => resetPin(), 2000);
        } else {
          err.textContent = `PIN incorrect (${5 - pinAttempts} essai${5 - pinAttempts > 1 ? 's' : ''} restant${5 - pinAttempts > 1 ? 's' : ''})`;
          err.style.display = 'block';
          reset(true);
        }
      }
    },
    'enterErr'
  );
}

// Reconnexion sur un appareil SANS session valide : vérification sécurisée côté
// serveur, qui renvoie un jeton échangé contre une vraie session Supabase.
function setupEnterPinRemote() {
  pinAttempts = 0;
  buildPad(
    'enterPad',
    'enterDots',
    async (val, reset) => {
      const email = window._returnEmail;
      const err = document.getElementById('enterErr');
      try {
        const result = await callPinAuth({action: 'verify', email, pin: val});
        const {data: verified, error: verifyErr} = await sb.auth.verifyOtp({
          token_hash: result.token_hash,
          type: 'email'
        });
        if (verifyErr || !verified?.session?.user)
          throw new Error('Connexion impossible. Réessaie.');
        currentUser = verified.session.user;
        localStorage.setItem(emailKey(currentUser.id), currentUser.email);
        localStorage.setItem(uidByEmailKey(email), currentUser.id);
        localStorage.setItem('tjp_last_uid', currentUser.id);
        localStorage.setItem('tjp_last_theme_uid', currentUser.id);
        pinAttempts = 0;
        afterPinValidated();
      } catch (e) {
        pinAttempts++;
        if (pinAttempts >= 5) {
          err.textContent = 'Trop de tentatives. Réessaie plus tard.';
          err.style.display = 'block';
          setTimeout(() => showOverlay('overlayGoogle'), 2000);
        } else {
          err.textContent = e.message || 'Code PIN incorrect.';
          err.style.display = 'block';
          reset(true);
        }
      }
    },
    'enterErr'
  );
}

async function afterPinValidated() {
  // Nouvelle session de connexion : on démarre une conversation IA fraîche,
  // la précédente reste consultable dans l'historique des conversations.
  pcStartFreshSessionConversation();

  // Afficher écran de chargement
  showOverlay(null);
  const loadEl = document.createElement('div');
  loadEl.id = 'loadingScreen';
  loadEl.style.cssText =
    'position:fixed;inset:0;background:var(--loading-screen-bg,#0b0f1a);z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
  loadEl.innerHTML =
    '<div style="font-family:var(--mono,monospace);font-size:14px;color:var(--muted,#6b7a99);">Chargement...</div>';
  document.body.appendChild(loadEl);

  // Refresh session
  try {
    const {data} = await sb.auth.refreshSession();
    if (data?.session?.user) currentUser = data.session.user;
  } catch (e) {}

  // Au tout premier chargement de page, l'app affiche instantanément les
  // données déjà en localStorage (avant même de savoir qui est connecté, pour
  // ne pas bloquer sur le réseau) — potentiellement celles d'un AUTRE compte
  // déjà utilisé sur cet appareil. Maintenant que currentUser est confirmé,
  // on réancre tout l'état local (comptes, trades, thème...) sur les clés
  // propres à CE compte avant de continuer, sans quoi un compte flambant
  // neuf hériterait des trades/réglages du compte précédent sur ce PC.
  if (typeof reanchorToCurrentUser === 'function') reanchorToCurrentUser();

  // Pull initial (avec tentatives), puis démarrage du temps réel + sondage périodique
  const pulled = await initialPullWithRetry();
  pullGlobalChatData();

  // Redécouvre les comptes créés/renommés depuis un autre appareil (voir
  // discoverCloudAccounts) et rafraîchit le menu des comptes si besoin.
  const accountsChanged = await discoverCloudAccounts();
  if (accountsChanged && typeof renderAccountMenu === 'function') renderAccountMenu();

  // Supprimer écran de chargement
  const le = document.getElementById('loadingScreen');
  if (le) le.remove();

  if (pulled) showSync('✓ Données chargées', '#22c55e');

  // Images des trades supprimés lors d'une session précédente (annulation
  // désormais impossible) : on les libère du stockage.
  if (typeof tjpFlushPendingImageDeletions === 'function') tjpFlushPendingImageDeletions();

  // Migration automatique des images encore en local vers le stockage cloud —
  // une seule fois par compte (marqueur posé uniquement en cas de succès complet,
  // donc ça réessaiera tout seul à la prochaine connexion si ça a été interrompu).
  if (currentUser && !localStorage.getItem(accKey('tjp_images_migrated'))) {
    migrateImagesToStorage();
  }

  setTimeout(startRealtime, 500);
  startPolling();
}

// Empreinte simple (non cryptographique, juste pour détecter un changement) du
// contenu actuel des trades, comparée à celle de la dernière sauvegarde locale
// exportée — pour ne proposer l'export que si quelque chose a réellement changé
// depuis (trade ajouté, supprimé, OU modifié même sans changer le nombre total).
function _tradesFingerprint(trades) {
  const str = JSON.stringify(trades || []);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) + h + str.charCodeAt(i);
    h = h & h;
  }
  return String(trades.length) + '_' + h.toString(36);
}

// ══ SAUVEGARDE LOCALE (export / import) — tous les comptes locaux ══
// ── Dossier de sauvegarde personnalisé (16/09/2026) ─────────────────────
// Bouton "Lieu de sauvegarde" de la carte "Sauvegarde locale" (Paramètres) :
// permet de
// choisir une bonne fois un dossier sur l'appareil, mémorisé (IndexedDB,
// un FileSystemDirectoryHandle ne peut pas se stocker en JSON/localStorage)
// pour que chaque "Exporter une sauvegarde" y écrive directement le
// fichier sans passer par le téléchargement classique du navigateur.
// Repose sur la File System Access API, absente de Firefox/Safari — sur
// ces navigateurs (et si aucun dossier n'a été choisi, ou permission
// refusée/révoquée depuis) exportLocalBackup() retombe simplement sur le
// téléchargement classique, comme avant ce correctif.
function bkdirOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tjp-backup-dir-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function bkdirSaveHandle(handle) {
  return bkdirOpenDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'dir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}
function bkdirLoadHandle() {
  return bkdirOpenDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('dir');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}
function bkdirClearHandle() {
  return bkdirOpenDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('dir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}
// Dossier mémorisé + permission encore valable (ou re-obtenue) → utilisable
// pour écrire directement dedans ; sinon null (jamais d'exception ici,
// exportLocalBackup() doit toujours pouvoir retomber sur le téléchargement
// classique).
async function bkdirGetUsableHandle() {
  if (!('showDirectoryPicker' in window)) return null;
  try {
    const handle = await bkdirLoadHandle();
    if (!handle) return null;
    let perm = await handle.queryPermission({mode: 'readwrite'});
    if (perm === 'prompt') perm = await handle.requestPermission({mode: 'readwrite'});
    return perm === 'granted' ? handle : null;
  } catch (e) {
    return null;
  }
}
function bkdirChooseFolder() {
  if (!('showDirectoryPicker' in window)) {
    alert(
      "Ton navigateur ne permet pas de choisir un dossier de sauvegarde (fonctionnalité disponible sur Chrome/Edge, PC et Android). Les sauvegardes continueront de se télécharger normalement."
    );
    return;
  }
  window
    .showDirectoryPicker({id: 'tjp-backup', mode: 'readwrite'})
    .then(handle => bkdirSaveHandle(handle).then(() => bkdirRefreshButton(handle)))
    .catch(e => {
      if (e && e.name !== 'AbortError') console.warn('Choix du dossier de sauvegarde :', e);
    });
}
function bkdirReset() {
  bkdirClearHandle().then(() => bkdirRefreshButton(null));
}
function bkdirRefreshButton(handle) {
  const btn = document.getElementById('backupDirBtn');
  const clearBtn = document.getElementById('bkdirClearBtn');
  if (!btn) return;
  if (handle) {
    btn.title = 'Dossier de sauvegarde : ' + (handle.name || '…') + ' (clique pour en choisir un autre)';
    if (clearBtn) clearBtn.style.display = '';
  } else {
    btn.title = 'Choisir où seront enregistrées les sauvegardes (par défaut : Téléchargements du navigateur)';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}
document.addEventListener('DOMContentLoaded', () => {
  if (!('indexedDB' in window) || !('showDirectoryPicker' in window)) return;
  bkdirLoadHandle()
    .then(handle => bkdirRefreshButton(handle))
    .catch(() => {});
});

async function exportLocalBackup() {
  try {
    const accs = getAccounts();
    const list = accs.length ? accs : [{id: _currentAccId || 'acc_1', name: 'Compte 1'}];
    const exportAccounts = list.map(acc => {
      const k = key => profileKey(`${key}__${acc.id}`);
      return {
        id: acc.id,
        name: acc.name,
        trades: JSON.parse(localStorage.getItem(k('tj_trades')) || '[]'),
        lists: JSON.parse(localStorage.getItem(k('tj_lists')) || '{}'),
        nextId: JSON.parse(localStorage.getItem(k('tj_nextId')) || '9000'),
        capital: localStorage.getItem(k('tj_capital')),
        risk: localStorage.getItem(k('tj_risk')),
        smartRisk: localStorage.getItem(k('tj_smart_risk')),
        riskMax: localStorage.getItem(k('tj_risk_max')),
        riskDecimal: localStorage.getItem(k('tj_risk_decimal')),
        payouts: localStorage.getItem(k('tj_payouts')),
        pencilEdits: localStorage.getItem(k('tj_pencil_edits')),
        cfConfig: localStorage.getItem(k('tj_cf_config')),
        rmConfig: {
          upTrigger: localStorage.getItem(k('tj_rm_up_trigger')),
          upTrades: localStorage.getItem(k('tj_rm_up_trades')),
          upPct: localStorage.getItem(k('tj_rm_up_pct')),
          upVarType: localStorage.getItem(k('tj_rm_up_var_type')),
          upVarVal: localStorage.getItem(k('tj_rm_up_var_val')),
          downTrigger: localStorage.getItem(k('tj_rm_down_trigger')),
          downTrades: localStorage.getItem(k('tj_rm_down_trades')),
          downPct: localStorage.getItem(k('tj_rm_down_pct')),
          downVarType: localStorage.getItem(k('tj_rm_down_var_type')),
          downVarVal: localStorage.getItem(k('tj_rm_down_var_val')),
          events: localStorage.getItem(k('tj_rm_events'))
        }
      };
    });
    const backup = {
      version: 3, // v3 : ajout de cfConfig (champs personnalisés) par compte
      exportedAt: new Date().toISOString(),
      activeAccId: _currentAccId,
      accounts: exportAccounts,
      theme: localStorage.getItem(profileKey('tj_theme_vars')),
      iaConfig: localStorage.getItem(profileKey('tjp_ia_config')),
      recapHistory: localStorage.getItem(profileKey('tjp_recap_history')),
      iaChatData: {
        conversations: localStorage.getItem(profileKey('tjp_pc_conversations')),
        activeConv: localStorage.getItem(profileKey('tjp_pc_active_conv')),
        history: localStorage.getItem(profileKey('tjp_pc_history'))
      }
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
    // Nom fixe (25/09/2026, demande de Paul) : dans le dossier choisi, une
    // sauvegarde du même nom écrase la précédente (getFileHandle plus bas,
    // create:true) — un nom qui varie (date, nombre de trades) empêchait
    // ça et faisait s'accumuler les fichiers. Un seul fichier, toujours à
    // jour.
    const filename = `Sauvegarde TJP.json`;

    // Dossier choisi via le bouton "Lieu de sauvegarde" (voir plus haut) :
    // écrit directement
    // dedans si possible, sinon téléchargement classique inchangé.
    let savedToCustomDir = false;
    try {
      const dirHandle = await bkdirGetUsableHandle();
      if (dirHandle) {
        const fileHandle = await dirHandle.getFileHandle(filename, {create: true});
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        savedToCustomDir = true;
      }
    } catch (e) {
      console.warn('Écriture dans le dossier choisi impossible, retour au téléchargement classique :', e);
    }
    if (!savedToCustomDir) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    localStorage.setItem(accKey('tj_last_backup_hash'), _tradesFingerprint(APP.trades));
    showSync(
      savedToCustomDir ? '✓ Sauvegarde enregistrée dans le dossier choisi' : '✓ Sauvegarde téléchargée',
      '#22c55e'
    );
  } catch (e) {
    console.error('Export de sauvegarde échoué :', e);
    showSync('⚠ Export échoué', '#ef4444');
  }
}

async function importLocalBackup(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!backup || !Array.isArray(backup.accounts) || !backup.accounts.length) {
      showSync('⚠ Fichier de sauvegarde invalide', '#ef4444');
      return;
    }
    let backupCount = 0;
    backup.accounts.forEach(acc => {
      if (!acc.id) return;
      const k = key => profileKey(`${key}__${acc.id}`);
      localStorage.setItem(k('tj_trades'), JSON.stringify(acc.trades || []));
      backupCount += (acc.trades || []).length;
      if (acc.lists) localStorage.setItem(k('tj_lists'), JSON.stringify(acc.lists));
      localStorage.setItem(k('tj_nextId'), JSON.stringify(acc.nextId || 9000));
      if (acc.capital) localStorage.setItem(k('tj_capital'), acc.capital);
      if (acc.risk) localStorage.setItem(k('tj_risk'), acc.risk);
      if (acc.smartRisk) localStorage.setItem(k('tj_smart_risk'), acc.smartRisk);
      if (acc.riskMax) localStorage.setItem(k('tj_risk_max'), acc.riskMax);
      if (acc.riskDecimal) localStorage.setItem(k('tj_risk_decimal'), acc.riskDecimal);
      if (acc.payouts) localStorage.setItem(k('tj_payouts'), acc.payouts);
      if (acc.pencilEdits) localStorage.setItem(k('tj_pencil_edits'), acc.pencilEdits);
      if (acc.cfConfig) localStorage.setItem(k('tj_cf_config'), acc.cfConfig);
      if (acc.rmConfig) {
        const rm = acc.rmConfig,
          kk = key => k('tj_' + key);
        if (rm.upTrigger) localStorage.setItem(kk('rm_up_trigger'), rm.upTrigger);
        if (rm.upTrades) localStorage.setItem(kk('rm_up_trades'), rm.upTrades);
        if (rm.upPct) localStorage.setItem(kk('rm_up_pct'), rm.upPct);
        if (rm.upVarType) localStorage.setItem(kk('rm_up_var_type'), rm.upVarType);
        if (rm.upVarVal) localStorage.setItem(kk('rm_up_var_val'), rm.upVarVal);
        if (rm.downTrigger) localStorage.setItem(kk('rm_down_trigger'), rm.downTrigger);
        if (rm.downTrades) localStorage.setItem(kk('rm_down_trades'), rm.downTrades);
        if (rm.downPct) localStorage.setItem(kk('rm_down_pct'), rm.downPct);
        if (rm.downVarType) localStorage.setItem(kk('rm_down_var_type'), rm.downVarType);
        if (rm.downVarVal) localStorage.setItem(kk('rm_down_var_val'), rm.downVarVal);
        if (rm.events) localStorage.setItem(kk('rm_events'), rm.events);
      }
      const accs = getAccounts();
      if (!accs.find(a => a.id === acc.id)) {
        accs.push({
          id: acc.id,
          name: acc.name || 'Compte ' + (accs.length + 1),
          pinHash: null,
          createdAt: Date.now()
        });
        saveAccounts(accs);
      }
    });
    if (backup.theme) localStorage.setItem(profileKey('tj_theme_vars'), backup.theme);
    if (backup.iaConfig) localStorage.setItem(profileKey('tjp_ia_config'), backup.iaConfig);
    if (backup.recapHistory) localStorage.setItem(profileKey('tjp_recap_history'), backup.recapHistory);
    if (backup.iaChatData) {
      if (backup.iaChatData.conversations)
        localStorage.setItem(profileKey('tjp_pc_conversations'), backup.iaChatData.conversations);
      if (backup.iaChatData.activeConv)
        localStorage.setItem(profileKey('tjp_pc_active_conv'), backup.iaChatData.activeConv);
      if (backup.iaChatData.history)
        localStorage.setItem(profileKey('tjp_pc_history'), backup.iaChatData.history);
    }
    const targetAcc = backup.activeAccId || backup.accounts[0]?.id;
    if (targetAcc) {
      setActiveAccId(targetAcc);
      _currentAccId = targetAcc;
    }
    _doSwitchAccount(_currentAccId);
    loadSavedTheme();
    window._intentionalBulkDelete = true; // remplacement volontaire, pas de garde-fou à déclencher
    schedulePush(0, {force: true});
    showSync('✓ Sauvegarde restaurée (' + backupCount + ' trades)', '#22c55e');
  } catch (e) {
    console.error('Import de sauvegarde échoué :', e);
    showSync('⚠ Fichier de sauvegarde invalide', '#ef4444');
  }
}

async function resetPin() {
  // Ne proposer d'exporter que si le contenu a changé depuis la dernière
  // sauvegarde locale exportée (nombre de trades différent, ou un trade modifié).
  const lastHash = localStorage.getItem(accKey('tj_last_backup_hash'));
  const currentHash = _tradesFingerprint(APP.trades);
  if (currentHash !== lastHash && APP.trades.length > 0) {
    showConfirm(
      'Exporter avant de partir ?',
      `Veux-tu exporter tes trades avant de te déconnecter ? En cas de problème de synchronisation, ça protège tes ${APP.trades.length} trade(s).`,
      async () => {
        exportLocalBackup();
        await _doResetPin();
      }
    );
    // Personnaliser les boutons pour ce contexte
    const acceptBtn = document.querySelector('#confirmModal .btn-d');
    const rejectBtn = document.querySelector('#confirmModal .btn-g');
    if (acceptBtn) acceptBtn.textContent = 'Oui';
    if (rejectBtn) {
      rejectBtn.textContent = 'Non';
      rejectBtn.onclick = async () => {
        document.getElementById('confirmModal').classList.remove('open');
        confirmCB = null;
        await _doResetPin();
      };
    }
    return;
  }
  await _doResetPin();
}

async function _doResetPin() {
  if (currentUser && currentUser.id) pinFailClear(currentUser.id);
  stopRealtime();
  stopPolling();
  if (typeof unanchorState === 'function') unanchorState();
  currentUser = null;
  _currentAccId = null;
  // Vide l'état en mémoire du compte qui vient de se déconnecter : la
  // prochaine connexion (même appareil, compte différent) repart de zéro le
  // temps que reanchorToCurrentUser() recharge les bonnes clés.
  APP.trades = [];
  APP.lists = DEF;
  APP.nextId = 9000;
  localStorage.removeItem('tjp_last_uid');
  // scope 'local' : ne déconnecte QUE cet appareil (par défaut, signOut() coupait
  // aussi la session de tous tes autres appareils).
  try {
    await sb.auth.signOut({scope: 'local'});
  } catch (e) {
    console.warn('signOut local :', e);
  }
  showOverlay('overlayGoogle');
}

function changePinFlow() {
  if (!currentUser) return;
  pinAttempts = pinFailRead(currentUser.id);
  document.getElementById('enterPinSub').textContent = 'Confirme ton code PIN actuel';
  document.getElementById('enterPinChangeEmailBtn').style.display = 'none';
  document.getElementById('enterPinCancelBtn').style.display = '';
  showOverlay('overlayEnterPin');
  buildPad(
    'enterPad',
    'enterDots',
    async (val, reset) => {
      const stored = localStorage.getItem(pinKey(currentUser.id));
      const attempt = await localPinHash(val, currentUser.id);
      const isLegacyMatch = stored === val; // migration silencieuse, comme à la connexion
      if (attempt === stored || isLegacyMatch) {
        pinAttempts = 0;
        pinFailClear(currentUser.id);
        // L'ancien PIN reste en place tant que le nouveau n'est pas confirmé :
        // avant, l'effacer ici permettait — en fermant la fenêtre en cours de
        // route — de recréer un PIN SANS connaître l'ancien.
        pinFirstEntry = '';
        restoreEnterPinOverlayDefaults();
        showOverlay('overlayCreatePin');
        setupCreatePin();
      } else {
        pinAttempts = pinFailAdd(currentUser.id);
        const err = document.getElementById('enterErr');
        if (pinAttempts >= 5) {
          err.textContent = 'Trop de tentatives.';
          err.style.display = 'block';
          setTimeout(() => cancelChangePin(), 2000);
        } else {
          err.textContent = `PIN incorrect (${5 - pinAttempts} essai${5 - pinAttempts > 1 ? 's' : ''} restant${5 - pinAttempts > 1 ? 's' : ''})`;
          err.style.display = 'block';
          reset(true);
        }
      }
    },
    'enterErr'
  );
}
// Remet l'overlay de saisie PIN dans son état par défaut (usage normal : connexion)
function restoreEnterPinOverlayDefaults() {
  document.getElementById('enterPinChangeEmailBtn').style.display = '';
  document.getElementById('enterPinCancelBtn').style.display = 'none';
  document.getElementById('enterErr').style.display = 'none';
}
// Annule le changement de PIN (mauvais code trop de fois, ou clic sur Annuler) : retour à l'app, rien n'est modifié
function cancelChangePin() {
  restoreEnterPinOverlayDefaults();
  pinAttempts = 0;
  showOverlay(null);
}

// Email saisi à la 2ème connexion → retrouver le PIN associé
async function submitReturnEmail() {
  const email = document.getElementById('returnEmail').value.trim().toLowerCase();
  const err = document.getElementById('returnEmailErr');
  err.style.display = 'none';
  if (!email || !email.includes('@')) {
    err.textContent = 'Email invalide.';
    err.style.display = 'block';
    return;
  }
  // Plus de recherche directe ici : avec la sécurité (RLS) activée, la table des
  // comptes n'est plus interrogeable depuis le navigateur. La vérification email+PIN
  // se fait entièrement côté serveur dans setupEnterPinRemote, en une seule étape.
  window._returnEmail = email;
  document.getElementById('enterPinSub').textContent = email;
  // Le compte n'est confirmé que côté serveur (voir setupEnterPinRemote),
  // mais on connaît déjà l'uid associé à cet email sur CET appareil depuis
  // une connexion précédente — assez pour styliser l'écran du code PIN
  // avant même de l'avoir saisi (sinon fond/touches par défaut le temps du
  // chargement).
  const cachedUid = localStorage.getItem(uidByEmailKey(email));
  if (cachedUid && typeof previewThemeForUid === 'function') previewThemeForUid(cachedUid);
  showOverlay('overlayEnterPin');
  setupEnterPinRemote();
}

// ══ AUTH INIT ══
async function initAuth() {
  function applyUser(user) {
    if (!user || currentUser) return;
    currentUser = user;
    localStorage.setItem(emailKey(currentUser.id), currentUser.email);
    localStorage.setItem(uidByEmailKey(currentUser.email.toLowerCase()), currentUser.id);
    localStorage.setItem('tjp_last_uid', currentUser.id);
    localStorage.setItem('tjp_last_theme_uid', currentUser.id);
    history.replaceState(null, '', window.location.pathname);
    // Applique tout de suite le thème de CE compte (déjà connu sur cet
    // appareil) — sans ça, l'écran du code PIN (fond, touches) s'affichait
    // avec les couleurs par défaut le temps de valider le code.
    if (typeof loadSavedTheme === 'function') loadSavedTheme();
    const pin = localStorage.getItem(pinKey(currentUser.id));
    if (pin) {
      document.getElementById('enterPinSub').textContent = currentUser.email;
      showOverlay('overlayEnterPin');
      setupEnterPin();
    } else {
      showOverlay('overlayCreatePin');
      setupCreatePin();
    }
  }

  const hash = window._oauthHash || '';
  const isOAuthReturn = hash.includes('access_token');
  let wait = null;
  if (isOAuthReturn) {
    showOverlay(null);
    wait = document.createElement('div');
    wait.id = 'oauthWait';
    wait.style.cssText =
      'position:fixed;inset:0;background:#0b0f1a;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:14px;color:#6b7a99;';
    wait.textContent = 'Connexion en cours...';
    document.body.appendChild(wait);
  }

  let session = null;

  if (isOAuthReturn) {
    // detectSessionInUrl est désactivé : on extrait et applique le token nous-mêmes
    const params = new URLSearchParams(hash.replace('#', ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      try {
        const {data, error} = await sb.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (!error && data?.session?.user) {
          session = data.session;
        }
      } catch (e) {}
    }
  } else {
    // Pas de retour OAuth : vérifier session existante
    try {
      const {data} = await sb.auth.getSession();
      session = data?.session;
    } catch (e) {}
  }

  if (wait) wait.remove();

  if (session?.user) {
    applyUser(session.user);
    return;
  }

  // Pas de session — tenter un rafraîchissement silencieux, sinon proposer la
  // reconnexion par email+PIN (vérification sécurisée côté serveur — plus de
  // session fabriquée localement comme avant).
  try {
    const {data} = await sb.auth.refreshSession();
    if (data?.session?.user) {
      applyUser(data.session.user);
      return;
    }
  } catch (e) {}

  const lastUid = localStorage.getItem('tjp_last_uid');
  const lastEmail = lastUid ? localStorage.getItem(emailKey(lastUid)) : null;
  showOverlay('overlayEmailPin');
  const inp = document.getElementById('returnEmail');
  if (inp) {
    if (lastEmail) inp.value = lastEmail;
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitReturnEmail();
    });
  }
}

// ══ SYNC ══
// ═══════════════════════════════════════════════════════════════════════
// ══ MODULE DE SYNCHRONISATION CLOUD — reconstruit entièrement ══
// ═══════════════════════════════════════════════════════════════════════
//
// Principes (comportement validé au fil de nombreuses corrections, mais
// code entièrement réécrit et réorganisé ici) :
//
//  1. Une sauvegarde AUTOMATIQUE (déclenchée par une modification locale)
//     FUSIONNE avec le cloud : elle garde tous les trades locaux et
//     réintègre ceux du cloud inconnus localement. Ça protège contre la
//     perte de données si un autre appareil a ajouté des trades entre-temps.
//
//  2. Une sauvegarde MANUELLE (bouton "Sauvegarder", suppression totale,
//     restauration d'une sauvegarde) FORCE : la version locale actuelle
//     remplace intégralement le cloud, sans fusion. C'est une décision
//     explicite de l'utilisateur, elle doit toujours l'emporter.
//
//  3. Une RÉCEPTION depuis le cloud qui proposerait MOINS de trades qu'en
//     local n'est jamais appliquée silencieusement. On compare l'horodatage :
//     si le cloud est plus récent que la dernière version connue, c'est un
//     changement volontaire fait ailleurs → on l'accepte. Sinon, on protège
//     en renvoyant la version locale vers le cloud.
//
//  4. Aucun code n'écrit jamais un tableau de trades vide par-dessus des
//     trades existants sans confirmation explicite (garde-fou générique).
//
// ═══════════════════════════════════════════════════════════════════════

// ── État interne ──
let _isSyncing = false; // vrai pendant qu'on applique des données reçues du cloud
let _isPushing = false; // vrai pendant qu'un envoi vers le cloud est en cours
let _pushGeneration = 0; // identifie chaque envoi pour ignorer les réponses obsolètes
let _lastPushTimestamp = null; // horodatage de notre dernier envoi réussi
let _lastChatPushTimestamp = null; // idem, mais pour la ligne globale des conversations IA
let _lastSeenCloudUpdatedAt = {}; // horodatage le plus récent vu du cloud, PAR compte local (acc_id)
let _realtimeChannel = null;

// ── Retour visuel ──
function showSync(msg, color = '#6b7a99') {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  el.style.display = 'block';
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => (el.style.display = 'none'), 2000);
}

// Bandeau persistant (ne disparaît pas tout seul) affiché tant que le dernier
// envoi vers le cloud a échoué.
function pcShowSyncFailureWarning(msg) {
  let bar = document.getElementById('syncFailBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'syncFailBar';
    bar.style.cssText =
      'position:relative;width:100%;background:var(--msg-banner-bg,#ef4444);color:var(--msg-banner-tx,#fff);font-family:var(--mono);font-size:12px;padding:8px 14px;text-align:center;z-index:900;cursor:pointer;box-sizing:border-box;';
    document.body.prepend(bar);
  }
  bar.onclick = () => manualSyncSave();
  bar.textContent =
    '⚠ Sauvegarde échouée (' +
    msg +
    ') — tes derniers trades ne sont peut-être pas synchronisés. Touche ici pour réessayer.';
  bar.style.display = 'block';
}
function pcHideSyncFailureWarning() {
  const bar = document.getElementById('syncFailBar');
  if (bar) bar.style.display = 'none';
}

// ── Construction du contenu à synchroniser ──
// Un seul endroit qui décrit tout ce qui doit partir vers le cloud, pour ne
// jamais avoir un bout de donnée personnelle qui reste "orphelin" en local
// uniquement sans qu'on s'en rende compte.
function buildSyncPayload(trades) {
  const now = new Date().toISOString();
  // Pseudo/photo : n'écrase la valeur cloud que si CET appareil a une valeur
  // locale connue (même vide, si volontairement effacée). Si la clé locale
  // n'existe pas du tout (jamais reçue sur cet appareil — sync pas encore
  // arrivée, appareil différent, etc.), on omet le champ du payload pour ne
  // jamais effacer une photo/pseudo bien réel côté cloud avec du vide local.
  const _localPseudo = localStorage.getItem(profileKey('tjp_profile_pseudo'));
  const _localPhoto = localStorage.getItem(profileKey('tjp_profile_photo'));
  return {
    user_id: currentUser.id,
    acc_id: _currentAccId, // isole les trades/réglages de CE sous-compte local des autres
    acc_name: (getAccounts().find(a => a.id === _currentAccId) || {}).name || null, // permet de redécouvrir ce compte (nom inclus) depuis un autre appareil, voir discoverCloudAccounts()
    trades,
    lists: APP.lists,
    next_id: typeof tjpSafeNextId === 'function' ? tjpSafeNextId(APP.nextId) : APP.nextId, // colonne integer : jamais au-delà de 2 147 483 647
    capital: localStorage.getItem(accKey('tj_capital')),
    risk: localStorage.getItem(accKey('tj_risk')),
    smart_risk: localStorage.getItem(accKey('tj_smart_risk')),
    risk_max: localStorage.getItem(accKey('tj_risk_max')),
    risk_decimal: localStorage.getItem(accKey('tj_risk_decimal')),
    theme: localStorage.getItem(profileKey('tj_theme_vars')), // thème global, partagé entre tous les comptes
    ...(_localPseudo != null ? {profile_pseudo: _localPseudo} : {}), // profil global, lié au compte (pas à un sous-compte de trading)
    ...(_localPhoto != null ? {profile_photo: _localPhoto} : {}),
    pencil_edits: (() => {
      try {
        const edits = JSON.parse(localStorage.getItem(accKey('tj_pencil_edits')) || '{}');
        const toSync = {};
        Object.entries(edits).forEach(([k, v]) => {
          toSync[k] = {html: v.html || '', col: v.col || '', fs: v.fs || '', t: v.t || 0};
        });
        return JSON.stringify(toSync);
      } catch (e) {
        return localStorage.getItem(accKey('tj_pencil_edits'));
      }
    })(),
    ia_config: localStorage.getItem(profileKey('tjp_ia_config')),
    recap_history: localStorage.getItem(profileKey('tjp_recap_history')),
    payouts: localStorage.getItem(accKey('tj_payouts')),
    cf_config: localStorage.getItem(accKey('tj_cf_config')), // config des champs personnalisés (custom-fields.js)
    rm_config: JSON.stringify({
      up_trigger: localStorage.getItem(accKey('tj_rm_up_trigger')),
      up_trades: localStorage.getItem(accKey('tj_rm_up_trades')),
      up_pct: localStorage.getItem(accKey('tj_rm_up_pct')),
      up_var_type: localStorage.getItem(accKey('tj_rm_up_var_type')),
      up_var_val: localStorage.getItem(accKey('tj_rm_up_var_val')),
      down_trigger: localStorage.getItem(accKey('tj_rm_down_trigger')),
      down_trades: localStorage.getItem(accKey('tj_rm_down_trades')),
      down_pct: localStorage.getItem(accKey('tj_rm_down_pct')),
      down_var_type: localStorage.getItem(accKey('tj_rm_down_var_type')),
      down_var_val: localStorage.getItem(accKey('tj_rm_down_var_val')),
      events: localStorage.getItem(accKey('tj_rm_events')) // journal des ajustements de risque / bascules du risque intelligent
    }),
    // ia_chat_data retiré d'ici : les conversations IA sont désormais globales
    // (synchronisées séparément par pushGlobalChatData, pas liées à un acc_id).
    deleted_trades: typeof tjpGetDeletedIds === 'function' ? tjpGetDeletedIds() : [], // pierres tombales (colonne jsonb, voir migration)
    updated_at: now
  };
}

// Détecte l'erreur Postgres "colonne inexistante" (42703) pour les colonnes
// ajoutées par des migrations Supabase à part (profile_pseudo/profile_photo,
// cf_config, acc_name), qui peuvent ne pas avoir encore été appliquées sur ce
// projet.
// Colonnes facultatives : si elles n'existent pas (encore) dans Supabase, on
// sauvegarde quand même tout le reste. ATTENTION : à l'écriture (upsert), Supabase
// renvoie le code PGRST204 « Could not find the 'x' column ... in the schema cache »
// (et non 42703, qui n'existe que pour les lectures) : les deux doivent être reconnus,
// sinon la sauvegarde échoue en 400 au lieu de se replier.
const TJP_OPTIONAL_COLUMNS = ['profile_pseudo', 'profile_photo', 'cf_config', 'acc_name', 'deleted_trades'];
function missingColumnName(error) {
  if (!error) return null;
  const msg = (error.message || '') + ' ' + (error.details || '');
  const m1 = msg.match(/Could not find the '([^']+)' column/i);
  if (m1) return m1[1];
  const m2 = msg.match(/column\s+(?:[\w"]+\.)?"?(\w+)"?\s+(?:of\s+relation\s+\S+\s+)?does not exist/i);
  return m2 ? m2[1] : null;
}
function isMissingProfileColumnError(error) {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;
  const col = missingColumnName(error);
  if (col) return TJP_OPTIONAL_COLUMNS.includes(col);
  const msg = ((error.message || '') + ' ' + (error.details || '')).toLowerCase();
  return TJP_OPTIONAL_COLUMNS.some(c => msg.includes(c));
}
function pushJournalDataRow(payload) {
  return sb.from('journal_data').upsert(payload, {onConflict: 'user_id,acc_id'});
}

// Marque un compte comme supprimé côté cloud. Volontairement un UPSERT (comme
// pour les trades) et non un DELETE SQL : les policies RLS de journal_data
// n'ont jamais inclus de permission DELETE (jamais nécessaire avant cette
// fonctionnalité), donc un DELETE direct est silencieusement filtré (0 ligne
// affectée, pas d'erreur JS) et la ligne — donc le compte fantôme — persiste.
// L'UPSERT, lui, est déjà autorisé de longue date : même chemin que le reste.
async function cloudDeleteAccount(accId) {
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    acc_id: accId,
    deleted: true,
    updated_at: new Date().toISOString()
  };
  const {error} = await sb.from('journal_data').upsert(payload, {onConflict: 'user_id,acc_id'});
  if (error && isMissingProfileColumnError(error)) {
    // Migration `deleted` pas encore appliquée côté Supabase : repli sur un
    // DELETE direct (ne fonctionnera que si la policy RLS l'autorise déjà).
    const del = await sb.from('journal_data').delete().eq('user_id', currentUser.id).eq('acc_id', accId);
    if (del.error) console.warn('Suppression cloud du compte échouée :', del.error);
  } else if (error) {
    console.warn('Suppression cloud du compte échouée :', error);
  }
}

// ── Envoi vers le cloud ──
// Renvoie true si la sauvegarde a bien abouti côté serveur, false sinon — utilisé
// par pcAskAI pour savoir si les données côté serveur sont fiables avant de laisser
// l'IA les interroger elle-même (sinon, mieux vaut les lui envoyer directement).
async function pushToCloud(opts) {
  opts = opts || {};
  if (!currentUser || !currentUser.id) return false;
  // Garde-fou anti-écrasement : tant que l'état en mémoire n'a pas été rechargé
  // pour le compte connecté (code PIN pas encore validé), il ne contient que
  // les valeurs par défaut de démarrage — les envoyer écraserait les vraies
  // données du cloud (voir isStateAnchored dans app-part1.js). Concerne aussi
  // les envois déclenchés à la fermeture / mise en arrière-plan de l'app.
  if (typeof isStateAnchored === 'function' && !isStateAnchored()) {
    console.warn('pushToCloud() ignoré : état non ancré sur le compte connecté.');
    _isPushing = false; // schedulePush() l'avait posé d'avance
    return false;
  }
  _isPushing = true;
  const myGen = ++_pushGeneration; // identifie ce push précis parmi d'éventuels chevauchements
  try {
    // getSession() renouvelle le jeton seulement s'il est proche de l'expiration
    // (refreshSession() faisait un aller-retour réseau à CHAQUE envoi).
    await sb.auth.getSession();
  } catch (e) {}

  try {
    // Fusion côté application (rapide, aucun risque d'expiration serveur) :
    // on récupère les trades actuellement dans le cloud et on réintègre ceux
    // que cet appareil ne connaît pas encore — sans jamais en supprimer un local.
    // Ignorée si opts.force (sauvegarde manuelle, suppression totale, restauration).
    let finalTrades = APP.trades;
    let tombstonesChangedTrades = false;
    if (!opts.force) {
      try {
        let res = await sb
          .from('journal_data')
          .select(window._noDeletedTradesCol ? 'trades' : 'trades, deleted_trades')
          .eq('user_id', currentUser.id)
          .eq('acc_id', _currentAccId)
          .maybeSingle();
        if (res.error && isMissingProfileColumnError(res.error)) {
          // Migration « deleted_trades » pas encore faite : fusion sans pierres tombales.
          window._noDeletedTradesCol = true;
          res = await sb
            .from('journal_data')
            .select('trades')
            .eq('user_id', currentUser.id)
            .eq('acc_id', _currentAccId)
            .maybeSingle();
        }
        const {data: cloudRow, error: fetchErr} = res;
        if (!fetchErr && cloudRow) {
          // Suppressions connues : cloud + locales + pile d'annulation de la session.
          const cloudDead = Array.isArray(cloudRow.deleted_trades) ? cloudRow.deleted_trades : [];
          const stackDead = (window._deletedTradesStack || [])
            .map(d => d.trade && d.trade.id)
            .filter(id => id != null);
          const allDead = Array.from(new Set(tjpGetDeletedIds().concat(cloudDead, stackDead)));
          if (allDead.length !== tjpGetDeletedIds().length) tjpSetDeletedIds(allDead);
          const dead = new Set(allDead);

          // 1) Un trade supprimé ailleurs ne doit pas être renvoyé par un appareil en retard.
          const alive = APP.trades.filter(t => !dead.has(t.id));
          if (alive.length !== APP.trades.length) {
            finalTrades = alive;
            tombstonesChangedTrades = true;
          }
          // 2) Réintègre les trades du cloud inconnus localement (jamais un supprimé).
          if (Array.isArray(cloudRow.trades) && cloudRow.trades.length) {
            const localIds = new Set(finalTrades.map(t => t.id));
            const recovered = cloudRow.trades.filter(t => !localIds.has(t.id) && !dead.has(t.id));
            if (recovered.length) finalTrades = finalTrades.concat(recovered);
          }
        }
      } catch (e) {
        console.warn('Fusion cloud impossible, envoi de la version locale seule :', e);
      }
    } else {
      // Envoi FORCÉ (sauvegarde manuelle, restauration...) : la version locale est
      // la vérité, donc un trade présent localement n'est plus « supprimé ».
      const present = new Set(APP.trades.map(t => t.id));
      tjpSetDeletedIds(tjpGetDeletedIds().filter(id => !present.has(id)));
    }
    if (myGen !== _pushGeneration) return true; // un envoi plus récent a pris le relais entre-temps

    const data = buildSyncPayload(finalTrades);
    _lastPushTimestamp = data.updated_at;
    // Colonne des suppressions déjà connue comme absente sur ce serveur : on ne
    // l'envoie pas (évite un aller-retour en erreur 400 à chaque sauvegarde).
    if (window._noDeletedTradesCol) delete data.deleted_trades;

    let sendData = data;
    let {error} = await pushJournalDataRow(sendData);
    if (myGen !== _pushGeneration) return true;

    // Une colonne facultative manque côté Supabase (migration pas encore faite) :
    // on ne bloque JAMAIS la sauvegarde des trades pour autant. On retire
    // uniquement la colonne signalée et on réessaie (les autres colonnes,
    // comme cf_config ou acc_name, continuent d'être synchronisées).
    for (let attempt = 0; attempt < TJP_OPTIONAL_COLUMNS.length && error && isMissingProfileColumnError(error); attempt++) {
      const col = missingColumnName(error);
      console.warn('Colonne absente côté Supabase, nouvel essai sans elle :', col || error.message);
      if (col === 'deleted_trades') window._noDeletedTradesCol = true;
      const next = Object.assign({}, sendData);
      if (col && col in next) delete next[col];
      else TJP_OPTIONAL_COLUMNS.forEach(c => delete next[c]); // colonne non identifiée : on retire toutes les facultatives
      sendData = next;
      ({error} = await pushJournalDataRow(sendData));
      if (myGen !== _pushGeneration) return true;
    }

    if (error) {
      console.error('Erreur sauvegarde journal_data :', error);
      showSync('⚠ ' + (error.message || 'Erreur sauvegarde'), '#ef4444');
      pcShowSyncFailureWarning(error.message || 'Erreur inconnue');
      return false;
    } else {
      showSync('✓ Sauvegardé', '#22c55e');
      localStorage.setItem(accKey('tjp_last_updated_at'), data.updated_at);
      _lastSeenCloudUpdatedAt[_currentAccId] = data.updated_at;
      pcHideSyncFailureWarning();
      window._blockPull = false;
      // Suppressions désormais confirmées côté cloud.
      if (typeof tjpSetPendingDeletedIds === 'function') tjpSetPendingDeletedIds([]);
      // Si la fusion a réintégré des trades du cloud (ou retiré des trades supprimés
      // ailleurs), on le reflète aussi tout de suite dans l'affichage local.
      if (finalTrades !== APP.trades) {
        APP.trades = finalTrades;
        // Retirer des trades supprimés ailleurs peut légitimement vider la liste.
        if (tombstonesChangedTrades) window._allowEmptySave = true;
        try {
          saveState();
        } finally {
          window._allowEmptySave = false;
        }
        renderTable();
        updateNavBadges();
      }
      return true;
    }
  } catch (e) {
    if (myGen === _pushGeneration) showSync('⚠ Réseau', '#f59e0b');
    return false;
  } finally {
    if (myGen === _pushGeneration)
      setTimeout(() => {
        // Ne pas lever le verrou si un nouvel envoi est déjà programmé
        // (sinon le sondage pouvait écraser l'état local par une version périmée).
        if (!window._pushPending) _isPushing = false;
      }, 500);
  }
}

// Sauvegarde manuelle, déclenchée par le bouton "Sauvegarder et synchroniser" :
// force TOUJOURS la version locale actuelle vers le cloud, sans fusion.
async function manualSyncSave() {
  if (!currentUser || !currentUser.id) {
    showSync('⚠ Non connecté', '#ef4444');
    return;
  }
  clearTimeout(window._pushTimer);
  const btns = [document.getElementById('mobileSyncBtn')].filter(Boolean);
  btns.forEach(b => {
    b.dataset.orig = b.textContent;
    b.textContent = 'Sauvegarde en cours...';
    b.disabled = true;
  });
  await pushToCloud({force: true});
  btns.forEach(b => {
    b.textContent = 'Sauvegardé !';
    setTimeout(() => {
      b.textContent = b.dataset.orig;
      b.disabled = false;
    }, 1500);
  });
}

// Programme un envoi vers le cloud après un court délai (regroupe les
// modifications rapprochées). Pose le verrou _isPushing IMMÉDIATEMENT, avant
// même le délai, pour empêcher le sondage périodique ou le temps réel de
// s'intercaler avec une version périmée pendant qu'on s'apprête à sauvegarder.
function schedulePush(delay, opts) {
  _isPushing = true;
  window._pushPending = true;
  window._pushOpts = Object.assign({}, window._pushOpts, opts || {});
  clearTimeout(window._pushTimer);
  window._pushTimer = setTimeout(() => {
    const o = window._pushOpts || {};
    window._pushOpts = {};
    window._pushPending = false;
    pushToCloud(o);
  }, delay);
}

// ── Conversations IA — globales, partagées par TOUS les sous-comptes ──
// Contrairement aux trades/réglages (une ligne par acc_id), les conversations
// avec l'agent IA doivent pouvoir être commencées sur un compte et continuées
// sur un autre : elles vivent donc dans une ligne à part, avec un acc_id
// sentinelle qui n'appartient à aucun vrai sous-compte de trading.
const GLOBAL_SYNC_ACC_ID = '__global__';

function applyIaChatData(iaChatDataStr) {
  if (!iaChatDataStr) return;
  try {
    const chat = JSON.parse(iaChatDataStr);
    if (chat.conversations != null)
      localStorage.setItem(profileKey('tjp_pc_conversations'), chat.conversations);
    if (chat.active_conv != null) localStorage.setItem(profileKey('tjp_pc_active_conv'), chat.active_conv);
    if (chat.history != null) localStorage.setItem(profileKey('tjp_pc_history'), chat.history);
    // pcConversations/pcActiveConvId sont chargées UNE SEULE FOIS au tout premier
    // chargement du script (avant que ce pull cloud, asynchrone, n'ait eu le temps
    // d'arriver) — sans ce recalage, la conversation restaurée reste invisible à
    // l'écran tant que la page n'est pas rechargée manuellement.
    if (typeof pcLoadConversations === 'function') pcConversations = pcLoadConversations();
    if (typeof pcGetActiveConvId === 'function') pcActiveConvId = pcGetActiveConvId();
    if (typeof pcRenderConvList === 'function') pcRenderConvList();
    if (typeof renderPcChat === 'function') renderPcChat();
    if (typeof renderPcHistory === 'function') renderPcHistory();
  } catch (e) {
    console.warn('Restauration ia_chat_data échouée :', e);
  }
}

async function pushGlobalChatData() {
  if (!currentUser || !currentUser.id) return;
  try {
    const row = {
      user_id: currentUser.id,
      acc_id: GLOBAL_SYNC_ACC_ID,
      ia_chat_data: JSON.stringify({
        conversations: localStorage.getItem(profileKey('tjp_pc_conversations')),
        active_conv: localStorage.getItem(profileKey('tjp_pc_active_conv')),
        history: localStorage.getItem(profileKey('tjp_pc_history'))
      }),
      updated_at: new Date().toISOString()
    };
    _lastChatPushTimestamp = row.updated_at;
    await sb.from('journal_data').upsert(row, {onConflict: 'user_id,acc_id'});
  } catch (e) {
    console.warn('Sync conversations IA échouée :', e);
  }
}

// Regroupe les sauvegardes rapprochées (ex: plusieurs messages d'affilée)
// en un seul envoi, comme schedulePush pour les trades.
function scheduleGlobalChatPush() {
  clearTimeout(window._chatPushTimer);
  window._chatPushTimer = setTimeout(pushGlobalChatData, 800);
}

async function pullGlobalChatData() {
  if (!currentUser || !currentUser.id) return;
  try {
    const {data, error} = await sb
      .from('journal_data')
      .select('ia_chat_data, updated_at')
      .eq('user_id', currentUser.id)
      .eq('acc_id', GLOBAL_SYNC_ACC_ID)
      .order('updated_at', {ascending: false})
      .limit(1);
    if (!error && data && data.length) applyIaChatData(data[0].ia_chat_data);
    else pushGlobalChatData(); // rien encore côté cloud : on y met l'état local actuel
  } catch (e) {}
}

// ── Réception depuis le cloud ──
// Va chercher la ligne cloud correspondant précisément à CE sous-compte local
// (user_id + acc_id). Avant l'introduction du multi-compte cloud, il n'existait
// qu'une ligne par user_id, sans acc_id : si rien n'est trouvé pour le compte
// n°1 (le tout premier, celui qui existait avant cette mise à jour), on va
// chercher cette ancienne ligne et on l'adopte pour lui — une seule fois, le
// prochain envoi la re-taggera avec le bon acc_id.
async function fetchCloudRowForCurrentAccount() {
  window._cloudFetchFailed = false; // distingue "lecture échouée" de "aucune ligne"
  const {data, error} = await sb
    .from('journal_data')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('acc_id', _currentAccId)
    .order('updated_at', {ascending: false})
    .limit(1);
  if (error) window._cloudFetchFailed = true;
  if (!error && data && data.length) return data[0];
  const accs = getAccounts();
  if (accs[0] && accs[0].id === _currentAccId) {
    const {data: legacy, error: legacyErr} = await sb
      .from('journal_data')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('acc_id', null)
      .order('updated_at', {ascending: false})
      .limit(1);
    if (legacyErr) window._cloudFetchFailed = true;
    if (!legacyErr && legacy && legacy.length) return legacy[0];
  }
  return null;
}

async function pullFromCloud() {
  if (!currentUser || !currentUser.id) return;
  try {
    await sb.auth.refreshSession();
  } catch (e) {}
  try {
    const row = await fetchCloudRowForCurrentAccount();
    if (!row) {
      // Lecture échouée (réseau, jeton...) ≠ compte sans données : dans ce cas on
      // n'envoie rien, sinon des valeurs par défaut pourraient écraser le cloud.
      if (window._cloudFetchFailed) return;
      await pushToCloud();
      return;
    } // premier envoi jamais fait pour ce compte
    _isSyncing = true;
    applyCloudData(row);
    setTimeout(() => (_isSyncing = false), 1000);
  } catch (e) {
    showSync('⚠ Réseau', '#f59e0b');
  }
}

// Tentative de pull initial au démarrage, avec plusieurs essais (réseau lent
// possible juste après la connexion). Renvoie true si des données ont bien
// été reçues et appliquées.
async function initialPullWithRetry() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await fetchCloudRowForCurrentAccount();
      if (row) {
        _isSyncing = true;
        applyCloudData(row);
        return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

// Décide si des données reçues du cloud doivent être appliquées, et gère le
// cas où le cloud propose MOINS de trades qu'en local (voir principe 3 en
// haut du fichier).
function applyCloudData(data, skipSafetyCheck) {
  // Si on vient de choisir "imposer le local", bloquer tout pull entrant
  // pendant la fenêtre de protection.
  if (window._blockPull && !skipSafetyCheck) return;

  const cloudTrades = data.trades || [];
  const localCount = APP.trades.length;
  const cloudCount = cloudTrades.length;

  if (!skipSafetyCheck && !window._intentionalBulkDelete && cloudCount < localCount) {
    const cloudTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const knownTs = _lastSeenCloudUpdatedAt[_currentAccId]
      ? new Date(_lastSeenCloudUpdatedAt[_currentAccId]).getTime()
      : 0;
    if (cloudTs > knownTs) {
      // Changement récent et volontaire fait sur un autre appareil : on l'accepte,
      // le code continue plus bas normalement (pas de retour anticipé ici).
    } else {
      // Rien de nouveau/récent à l'horizon : probablement cet appareil resté figé
      // sur une vieille donnée. On protège en imposant la version locale.
      window._blockPull = true;
      clearTimeout(window._blockPullTimer);
      window._blockPullTimer = setTimeout(() => {
        window._blockPull = false;
      }, 15000);
      schedulePush(0, {force: true});
      return;
    }
  }
  window._intentionalBulkDelete = false;
  _applyCloudDataDirect(data, cloudTrades);
}

// Applique réellement des données cloud à l'état local (localStorage + DOM).
// N'est appelé qu'après que applyCloudData ait validé que c'est sûr de le faire.
function _applyCloudDataDirect(data, cloudTrades) {
  if (data.updated_at) _lastSeenCloudUpdatedAt[_currentAccId] = data.updated_at;
  const incomingTradesRaw = cloudTrades || data.trades || [];
  // Le cloud fait foi pour les suppressions confirmées ; on y ajoute celles faites
  // ici et pas encore confirmées (sinon un trade supprimé hors ligne réapparaîtrait
  // au rechargement).
  const _remoteDead = Array.isArray(data.deleted_trades) ? data.deleted_trades : null;
  let incomingTrades = incomingTradesRaw;
  if (_remoteDead && typeof tjpSetDeletedIds === 'function') {
    const pending = tjpGetPendingDeletedIds();
    tjpSetDeletedIds(_remoteDead.concat(pending));
    const dead = new Set(_remoteDead.concat(pending));
    incomingTrades = incomingTradesRaw.filter(t => !dead.has(t.id));
  } else if (typeof tjpGetPendingDeletedIds === 'function') {
    const dead = new Set(tjpGetPendingDeletedIds());
    if (dead.size) incomingTrades = incomingTradesRaw.filter(t => !dead.has(t.id));
  }

  // Garde-fou générique : on ne remplace jamais silencieusement des trades
  // existants par un tableau vide, sauf confirmation explicite (suppression
  // volontaire, restauration avec force).
  const prevCount = Array.isArray(APP.trades) ? APP.trades.length : 0;
  const nextCount = Array.isArray(incomingTradesRaw) ? incomingTradesRaw.length : 0;
  if (
    prevCount > 0 &&
    nextCount === 0 &&
    !window._intentionalBulkDelete &&
    !window._allowEmptySave
  ) {
    console.error(
      "🛑 _applyCloudDataDirect() BLOQUÉ : le cloud proposait 0 trade alors qu'il y en avait " +
        prevCount +
        " en local. Pile d'appel :"
    );
    console.trace();
    showSync(
      '⚠ Synchronisation bloquée (anti-perte) — recharge l\'app ; si ça se reproduit, exporte tes trades',
      '#ef4444'
    );
    return;
  }

  APP.trades = incomingTrades;
  window._intentionalBulkDelete = false;
  // Anciens trades de démonstration reçus du cloud : retirés ici, puis cloud
  // écrasé en fin de fonction.
  const _demoPurged = typeof purgeDemoTrades === 'function' ? purgeDemoTrades() : 0;

  if (data.lists) {
    const merged = {...APP.lists};
    Object.entries(data.lists).forEach(([k, v]) => {
      if (v && v.length > 0) merged[k] = v;
    });
    APP.lists = merged;
  }
  APP.nextId = tjpSafeNextId(data.next_id || APP.nextId);

  if (data.capital) localStorage.setItem(accKey('tj_capital'), data.capital);
  if (data.risk) localStorage.setItem(accKey('tj_risk'), data.risk);
  if (data.smart_risk != null) localStorage.setItem(accKey('tj_smart_risk'), data.smart_risk);
  if (data.risk_max) localStorage.setItem(accKey('tj_risk_max'), data.risk_max);
  if (data.risk_decimal != null) localStorage.setItem(accKey('tj_risk_decimal'), data.risk_decimal);
  if (data.payouts) localStorage.setItem(accKey('tj_payouts'), data.payouts);

  if (data.cf_config) {
    localStorage.setItem(accKey('tj_cf_config'), data.cf_config);
    // Recharge la config des champs personnalisés en mémoire pour ce compte
    // (custom-fields.js) — les appels renderTable()/refreshAllCharts() plus
    // bas s'en serviront pour redessiner colonnes/KPI/graphiques à jour.
    if (typeof cfLoad === 'function') {
      cfLoad();
      if (typeof cfEnsureOrders === 'function') cfEnsureOrders();
    }
  }

  // Propage le renommage d'un compte fait sur un autre appareil : si le nom
  // reçu du cloud diffère du nom local pour ce compte, on aligne le local.
  if (data.acc_name) {
    const _accsForRename = getAccounts();
    const _accIdxForRename = _accsForRename.findIndex(a => a.id === _currentAccId);
    if (_accIdxForRename !== -1 && _accsForRename[_accIdxForRename].name !== data.acc_name) {
      _accsForRename[_accIdxForRename].name = data.acc_name;
      saveAccounts(_accsForRename);
      if (typeof renderAccountMenu === 'function') renderAccountMenu();
    }
  }

  if (data.profile_pseudo != null)
    localStorage.setItem(profileKey('tjp_profile_pseudo'), data.profile_pseudo);
  if (data.profile_photo != null)
    localStorage.setItem(profileKey('tjp_profile_photo'), data.profile_photo);
  if (typeof renderAccountMenu === 'function') renderAccountMenu();

  if (data.theme) {
    localStorage.setItem(profileKey('tj_theme_vars'), data.theme);
    try {
      const v = JSON.parse(data.theme);
      Object.entries(v).forEach(([k, c]) => document.documentElement.style.setProperty(k, c));
      // Met aussi à jour l'état en mémoire de l'éditeur de thème, sinon le panneau
      // Modifications continue d'afficher l'ancienne couleur même si le CSS a changé.
      if (typeof teVals !== 'undefined') {
        teVals = {...teVals, ...v};
        if (
          document.getElementById('page-modifs')?.classList.contains('active') &&
          typeof renderTE === 'function'
        )
          renderTE();
      }
    } catch (e) {}
  }

  if (data.pencil_edits) {
    try {
      const remoteEdits = JSON.parse(data.pencil_edits);
      const localEdits = JSON.parse(localStorage.getItem(accKey('tj_pencil_edits')) || '{}');
      // Fusion par horodatage : pour un même texte modifié sur deux appareils différents,
      // c'est la modification la plus RÉCENTE (peu importe l'appareil) qui gagne — pas
      // systématiquement celle de l'appareil sur lequel on se trouve actuellement.
      const merged = {};
      const allKeys = new Set([...Object.keys(remoteEdits), ...Object.keys(localEdits)]);
      allKeys.forEach(k => {
        const r = remoteEdits[k],
          l = localEdits[k];
        if (r && l) merged[k] = (r.t || 0) > (l.t || 0) ? r : l;
        else merged[k] = r || l;
      });
      localStorage.setItem(accKey('tj_pencil_edits'), JSON.stringify(merged));
    } catch (e) {
      localStorage.setItem(accKey('tj_pencil_edits'), data.pencil_edits);
    }
  }

  if (data.ia_config) localStorage.setItem(profileKey('tjp_ia_config'), data.ia_config);
  if (data.recap_history) localStorage.setItem(profileKey('tjp_recap_history'), data.recap_history);

  if (data.rm_config) {
    try {
      const rm = JSON.parse(data.rm_config);
      if (rm.up_trigger != null) localStorage.setItem(accKey('tj_rm_up_trigger'), rm.up_trigger);
      if (rm.up_trades != null) localStorage.setItem(accKey('tj_rm_up_trades'), rm.up_trades);
      if (rm.up_pct != null) localStorage.setItem(accKey('tj_rm_up_pct'), rm.up_pct);
      if (rm.up_var_type != null) localStorage.setItem(accKey('tj_rm_up_var_type'), rm.up_var_type);
      if (rm.up_var_val != null) localStorage.setItem(accKey('tj_rm_up_var_val'), rm.up_var_val);
      if (rm.down_trigger != null)
        localStorage.setItem(accKey('tj_rm_down_trigger'), rm.down_trigger);
      if (rm.down_trades != null) localStorage.setItem(accKey('tj_rm_down_trades'), rm.down_trades);
      if (rm.down_pct != null) localStorage.setItem(accKey('tj_rm_down_pct'), rm.down_pct);
      if (rm.down_var_type != null)
        localStorage.setItem(accKey('tj_rm_down_var_type'), rm.down_var_type);
      if (rm.down_var_val != null)
        localStorage.setItem(accKey('tj_rm_down_var_val'), rm.down_var_val);
      if (rm.events != null) localStorage.setItem(accKey('tj_rm_events'), rm.events);
    } catch (e) {
      console.warn('Restauration rm_config échouée :', e);
    }
  }

  // ia_chat_data n'est plus appliqué ici : voir applyIaChatData / pullGlobalChatData
  // (conversations IA désormais globales, indépendantes du sous-compte actif).

  // Sauvegarder localement SANS déclencher un nouvel envoi (on reçoit du cloud)
  _isSyncing = true;
  lssAcc('tj_trades', APP.trades);
  lssAcc('tj_lists', APP.lists);
  lssAcc('tj_nextId', APP.nextId);
  renderTable();
  updateNavBadges();
  setTimeout(() => {
    if (typeof populateSelects === 'function') populateSelects();
    refreshAllCharts();
    renderTop5();
    if (document.getElementById('page-modifs')?.classList.contains('active')) renderModifs();
    applyPencilEdits();
  }, 200);
  localStorage.setItem('tjp_last_uid', currentUser.id);
  localStorage.setItem('tjp_last_theme_uid', currentUser.id);
  if (data.updated_at) localStorage.setItem(accKey('tjp_last_updated_at'), data.updated_at);
  setTimeout(() => {
    _isSyncing = false;
  }, 1000);
  // Mode force : sans ça, la fusion automatique de pushToCloud() réintégrerait
  // depuis le cloud les trades de démo qu'on vient de retirer.
  if (_demoPurged) schedulePush(0, {force: true});
}

// ── Temps réel ──
let _realtimeRetryCount = 0;
function startRealtime() {
  if (!currentUser || _realtimeChannel) return;
  _realtimeChannel = sb
    .channel('tjp_changes_' + currentUser.id)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'journal_data',
        filter: 'user_id=eq.' + currentUser.id
      },
      payload => {
        // Log de diagnostic temporaire (à retirer une fois le temps réel
        // confirmé fiable) : à supprimer/ignorer si tout fonctionne, mais
        // permet de voir dans la console si l'évènement arrive bien et avec
        // quelles données, en cas de nouveau souci de propagation.
        console.log(
          '[TJP realtime]',
          payload.eventType,
          'acc_id=' + (payload.new?.acc_id ?? payload.old?.acc_id),
          'deleted=' + payload.new?.deleted
        );
        if (payload.eventType === 'DELETE') {
          // Une ligne journal_data a été supprimée (compte supprimé sur un
          // autre appareil) : on réconcilie tout de suite avec le cloud
          // plutôt que d'attendre le sondage (~1 min), pour que la
          // suppression se propage ici quasi instantanément.
          discoverCloudAccounts().then(changed => {
            if (changed && typeof renderAccountMenu === 'function') renderAccountMenu();
          });
          return;
        }
        if (!payload.new || payload.new.user_id !== currentUser.id) return;
        if (payload.new.acc_id === GLOBAL_SYNC_ACC_ID) {
          if (_lastChatPushTimestamp && payload.new.updated_at === _lastChatPushTimestamp) return;
          applyIaChatData(payload.new.ia_chat_data);
          return;
        }
        if (payload.new.acc_id !== _currentAccId) {
          // Évènement pour un AUTRE sous-compte : compte tout juste marqué
          // supprimé (deleted:true, voir cloudDeleteAccount) OU compte encore
          // inconnu ici (créé ailleurs) → réconcilier tout de suite plutôt
          // que d'attendre le prochain sondage (~1 min).
          if (payload.new.deleted || !getAccounts().some(a => a.id === payload.new.acc_id)) {
            discoverCloudAccounts().then(changed => {
              if (changed && typeof renderAccountMenu === 'function') renderAccountMenu();
            });
          }
          return;
        }
        if (payload.new.deleted) return; // notre propre compte actif marqué supprimé ailleurs : rien à appliquer
        if (_lastPushTimestamp && payload.new.updated_at === _lastPushTimestamp) return; // écho de notre propre envoi
        _isSyncing = true;
        applyCloudData(payload.new);
        setTimeout(() => (_isSyncing = false), 500);
        showSync('✓ Sync', '#22c55e');
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        _realtimeRetryCount = 0;
        showSync('✓ Temps réel actif', '#22c55e');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Le canal est mort (réseau coupé, veille, jeton expiré...) : sans ça
        // il reste bloqué silencieusement pour toujours, car startRealtime()
        // refuse de relancer tant que _realtimeChannel référence encore
        // l'ancien canal (même mort). On le libère et on retente, avec un
        // délai qui double à chaque échec (3s, 6s, 12s... plafonné à 60s) —
        // sans ça, un réseau durablement coupé fait retenter toutes les 3s
        // indéfiniment, ce qui inonde la console d'erreurs sans jamais
        // s'arrêter (25/09/2026, bug signalé par Paul).
        if (_realtimeChannel) {
          sb.removeChannel(_realtimeChannel);
          _realtimeChannel = null;
        }
        const delay = Math.min(3000 * Math.pow(2, _realtimeRetryCount), 60000);
        _realtimeRetryCount++;
        setTimeout(() => {
          if (currentUser) startRealtime();
        }, delay);
      }
    });
}
function stopRealtime() {
  _realtimeRetryCount = 0;
  if (_realtimeChannel) {
    sb.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

// ── Sondage périodique (filet de sécurité si le temps réel a un souci) ──
// Redécouvre, à partir du cloud, les comptes de trading créés sur un autre
// appareil et pas encore connus localement (ex : "Compte 2" créé sur PC,
// jamais vu sur le téléphone). Sans ça, la liste des comptes elle-même
// (tjp_accounts) ne vivait que dans le stockage local de chaque appareil :
// les données de chaque compte étaient bien synchronisées via leur acc_id,
// mais rien ne recréait localement un compte dont on n'avait jamais entendu
// parler sur CET appareil. Propage aussi les renommages (acc_name).
async function discoverCloudAccounts() {
  if (!currentUser) return false;
  let sel = await sb
    .from('journal_data')
    .select('acc_id, acc_name')
    .eq('user_id', currentUser.id)
    .not('acc_id', 'is', null)
    .neq('acc_id', GLOBAL_SYNC_ACC_ID)
    .eq('deleted', false);
  if (sel.error && isMissingProfileColumnError(sel.error)) {
    // acc_name/deleted pas encore migrées côté Supabase : on découvre quand
    // même les comptes (sans filtre "deleted" ni nom, repli par défaut).
    sel = await sb
      .from('journal_data')
      .select('acc_id')
      .eq('user_id', currentUser.id)
      .not('acc_id', 'is', null)
      .neq('acc_id', GLOBAL_SYNC_ACC_ID);
  }
  if (sel.error || !sel.data) return false;
  let accs = getAccounts();
  let changed = false;
  const seen = new Set();
  sel.data.forEach(row => {
    if (!row.acc_id || seen.has(row.acc_id)) return;
    seen.add(row.acc_id);
    const existing = accs.find(a => a.id === row.acc_id);
    if (!existing) {
      accs.push({
        id: row.acc_id,
        name: row.acc_name || 'Compte ' + (accs.length + 1),
        pinHash: null,
        createdAt: Date.now()
      });
      changed = true;
    } else {
      if (row.acc_name && existing.name !== row.acc_name) {
        existing.name = row.acc_name;
        changed = true;
      }
      if (existing.pendingSync) {
        // Vu au moins une fois dans le cloud : ce compte est bien arrivé,
        // il n'a plus besoin d'être protégé d'une suppression locale.
        delete existing.pendingSync;
        changed = true;
      }
    }
  });
  // Retire les comptes locaux dont la ligne cloud a disparu (compte
  // supprimé depuis un autre appareil) — jamais le compte actif, ni un
  // compte encore "pendingSync" (tout juste créé, jamais vu dans le cloud
  // ne serait-ce qu'une fois — donc son 1er push n'est probablement pas
  // encore arrivé, pas de suppression). Pas de délai arbitraire ici : dès
  // qu'un compte a été vu une fois (ci-dessus), son absence signifie une
  // vraie suppression, pas un push en retard.
  const before = accs.length;
  accs = accs.filter(a => {
    if (a.id === _currentAccId) return true;
    if (seen.has(a.id)) return true;
    if (a.pendingSync) return true;
    return false;
  });
  if (accs.length !== before) changed = true;
  if (changed) saveAccounts(accs);
  return changed;
}

let _pollTickCount = 0;
function startPolling() {
  if (window._pollInterval) return;
  window._pollInterval = setInterval(async () => {
    if (!currentUser || _isSyncing || _isPushing) return;
    try {
      // getSession() : lit la session locale (renouvelée toute seule si besoin par
      // autoRefreshToken) — refreshSession() faisait une requête réseau toutes les
      // 15 s et pouvait entrer en collision avec le renouvellement automatique.
      const {data: sd} = await sb.auth.getSession();
      if (sd?.session?.user) currentUser = sd.session.user;
      if (sd?.session?.access_token && sb.realtime && typeof sb.realtime.setAuth === 'function') {
        sb.realtime.setAuth(sd.session.access_token); // voir startRealtime() : jeton du canal temps réel tenu à jour
      }
      // Filet de sécurité : si le canal temps réel a disparu sans même passer
      // par un statut d'erreur explicite (websocket mort en silence), on le
      // relance ici — pire cas, la synchro reste au moins réactive sous 15s.
      if (!_realtimeChannel) startRealtime();
      // 1) Requête légère : seulement l'horodatage de la ligne cloud.
      const {data: head, error: headErr} = await sb
        .from('journal_data')
        .select('updated_at')
        .eq('user_id', currentUser.id)
        .eq('acc_id', _currentAccId)
        .order('updated_at', {ascending: false})
        .limit(1);
      if (!headErr && head && head.length) {
        const localTs = localStorage.getItem(accKey('tjp_last_updated_at'));
        if (!localTs || head[0].updated_at > localTs) {
          // 2) Il y a du nouveau : on télécharge alors la ligne complète.
          const {data, error} = await sb
            .from('journal_data')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('acc_id', _currentAccId)
            .order('updated_at', {ascending: false})
            .limit(1);
          if (!error && data && data.length && !_isPushing) {
            _isSyncing = true;
            applyCloudData(data[0]);
            showSync('✓ Mis à jour', '#22c55e');
          }
        }
      }
      // Découverte des comptes créés depuis un autre appareil, en tâche de
      // fond, moins souvent que le sondage principal (~1 min au lieu de 15s)
      // pour limiter le nombre de requêtes.
      _pollTickCount++;
      if (_pollTickCount % 4 === 0) {
        const accountsChanged = await discoverCloudAccounts();
        if (accountsChanged && typeof renderAccountMenu === 'function') renderAccountMenu();
      }
    } catch (e) {}
  }, 15000); // toutes les 15s
}
function stopPolling() {
  if (window._pollInterval) {
    clearInterval(window._pollInterval);
    window._pollInterval = null;
  }
}

// ── Sauvegarde à la fermeture/mise en arrière-plan ──
window.addEventListener('beforeunload', () => {
  if (currentUser && !_isSyncing && !_isPushing) pushToCloud();
});
// Sur mobile, 'beforeunload' ne se déclenche pas toujours (changement d'app,
// verrouillage d'écran). 'visibilitychange' est plus fiable pour détecter
// qu'on quitte l'app sur mobile.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && currentUser && !_isSyncing && !_isPushing) {
    pushToCloud();
  }
});

// ══ STAR PICKER avec demi-étoile ══
function initStarPicker(pickerId, hiddenId, val) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const hidden = document.getElementById(hiddenId);
  // Cloner les étoiles pour supprimer les anciens listeners
  picker.querySelectorAll('.star-pick').forEach(s => {
    const clone = s.cloneNode(true);
    s.parentNode.replaceChild(clone, s);
  });
  const stars = picker.querySelectorAll('.star-pick');

  function setVal(v) {
    if (hidden) hidden.value = v;
    picker.dataset.val = v;
    stars.forEach((s, i) => {
      s.classList.remove('on', 'half');
      if (v >= i + 1) s.classList.add('on');
      else if (v >= i + 0.5) s.classList.add('half');
    });
  }

  setVal(parseFloat(val) || 0);

  stars.forEach((s, i) => {
    s.addEventListener('click', e => {
      const rect = s.getBoundingClientRect();
      const isLeft = e.clientX - rect.left < rect.width / 2;
      const newVal = isLeft ? i + 0.5 : i + 1;
      const cur = parseFloat(hidden?.value) || 0;
      setVal(cur === newVal ? 0 : newVal);
    });
    s.addEventListener('mousemove', e => {
      const rect = s.getBoundingClientRect();
      const isLeft = e.clientX - rect.left < rect.width / 2;
      const hv = isLeft ? i + 0.5 : i + 1;
      stars.forEach((x2, j) => {
        x2.classList.remove('on', 'half');
        if (hv >= j + 1) x2.classList.add('on');
        else if (hv >= j + 0.5) x2.classList.add('half');
      });
    });
    s.addEventListener('mouseleave', () => setVal(parseFloat(hidden?.value) || 0));
  });
  picker.addEventListener('mouseleave', () => setVal(parseFloat(hidden?.value) || 0));
}

// ══ IMAGES FORMULAIRE ══
window._formImages = [];
// Compresse une image (redimensionne + recompresse en JPEG) avant stockage,
// pour éviter de saturer le quota localStorage avec des captures haute résolution.
// ══ Stockage des images de trades dans Supabase Storage (au lieu du localStorage) ══
// Le localStorage du navigateur a une limite dure d'environ 5-10 Mo au total ; le
// stocker dans un bucket Supabase Storage supprime cette limite (plusieurs Go
// disponibles) et allège au passage le volume synchronisé avec le cloud.
const TRADE_IMAGES_BUCKET = 'trade-images';

function _tradeImagePathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/${TRADE_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null; // pas une URL de ce bucket (ex: encore une ancienne image en base64)
  return url.slice(idx + marker.length).split('?')[0];
}

async function uploadProfilePhotoToStorage(compressedDataUrl) {
  try {
    if (!currentUser || !currentUser.id || !window.sb) return compressedDataUrl;
    const res = await fetch(compressedDataUrl);
    const blob = await res.blob();
    const fileName = `${currentUser.id}/profile_${Date.now()}.jpg`;
    const {error: uploadErr} = await sb.storage
      .from(TRADE_IMAGES_BUCKET)
      .upload(fileName, blob, {contentType: 'image/jpeg', upsert: true});
    if (uploadErr) {
      console.warn('Upload photo de profil échoué, conservation en local :', uploadErr);
      return compressedDataUrl;
    }
    const {data: urlData} = sb.storage.from(TRADE_IMAGES_BUCKET).getPublicUrl(fileName);
    return urlData && urlData.publicUrl ? urlData.publicUrl : compressedDataUrl;
  } catch (e) {
    console.warn('Upload photo de profil échoué (exception) :', e);
    return compressedDataUrl;
  }
}

const R2_UPLOAD_ENDPOINT = 'https://ghjashqgwlaofjubzrcp.supabase.co/functions/v1/r2-upload';

// Upload une image déjà compressée (data URL) vers Cloudflare R2 via l'Edge Function
// r2-upload (qui seule détient les clés R2) et renvoie son URL publique. Si l'upload
// échoue (pas de réseau, fonction indisponible...), on garde l'image compressée en
// base64 en secours plutôt que de perdre la donnée — même filet de sécurité qu'avant.
async function uploadTradeImageToR2(compressedDataUrl) {
  try {
    if (!currentUser || !currentUser.id || !window.sb) return compressedDataUrl;
    const {data: sessionData} = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return compressedDataUrl;
    const res = await fetch(R2_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
      body: JSON.stringify({action: 'upload', dataUrl: compressedDataUrl})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      console.warn('Upload image vers R2 échoué, conservation en local :', data.error || res.status);
      return compressedDataUrl;
    }
    return data.url || compressedDataUrl;
  } catch (e) {
    console.warn('Upload image vers R2 échoué (exception), conservation en local :', e);
    return compressedDataUrl;
  }
}

// Supprime le fichier correspondant (best-effort, silencieux — si ça échoue on n'embête
// pas l'utilisateur, ça laissera juste un fichier orphelin). Détecte automatiquement
// l'hébergeur : anciennes images encore sur Supabase Storage, ou nouvelles sur R2.
function deleteTradeImageFromStorage(url) {
  if (!url || typeof url !== 'string' || url.startsWith('data:image')) return;
  const supabasePath = _tradeImagePathFromUrl(url);
  if (supabasePath && window.sb) {
    sb.storage
      .from(TRADE_IMAGES_BUCKET)
      .remove([supabasePath])
      .catch(e => console.warn('Suppression image Supabase Storage échouée (ignorée) :', e));
    return;
  }
  deleteTradeImageFromR2(url);
}

async function deleteTradeImageFromR2(url) {
  try {
    if (!currentUser || !currentUser.id || !window.sb) return;
    const {data: sessionData} = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;
    await fetch(R2_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
      body: JSON.stringify({action: 'delete', url})
    });
  } catch (e) {
    console.warn('Suppression image R2 échouée (ignorée) :', e);
  }
}

// Migre toutes les images déjà stockées en base64 (ancien système) vers Supabase
// Storage, trade par trade. Idempotent : une image déjà migrée (URL, pas data:)
// est simplement ignorée. Appelée automatiquement une seule fois par compte,
// à la première connexion suivant la mise à jour (voir initAuth).
async function migrateImagesToStorage() {
  if (!currentUser || !currentUser.id) return;
  const toMigrate = [];
  APP.trades.forEach((t, ti) => {
    (t.images || []).forEach((src, ii) => {
      if (typeof src === 'string' && src.startsWith('data:')) toMigrate.push({ti, ii});
    });
  });
  if (!toMigrate.length) return;
  let done = 0,
    failed = 0;
  for (const {ti, ii} of toMigrate) {
    const t = APP.trades[ti];
    if (!t || !t.images || !t.images[ii]) continue;
    const original = t.images[ii];
    try {
      const compressed = await compressImage(original);
      const uploaded = await uploadTradeImageToR2(compressed);
      if (uploaded && !uploaded.startsWith('data:')) {
        t.images[ii] = uploaded;
        done++;
      } else {
        failed++;
      }
    } catch (e) {
      console.warn('Migration image échouée (conservée en local) :', e);
      failed++;
    }
  }
  saveState();
  renderTable();
  if (done) showSync(`✓ ${done} image(s) déplacée(s) vers le stockage cloud`, '#22c55e');
  if (!failed) localStorage.setItem(accKey('tjp_images_migrated'), '1'); // tout est passé : plus besoin de réessayer aux prochaines connexions
}

// maxWidth/quality par défaut pensés pour rester nets même zoomés à 5x (cf. openFullscreen) :
// une capture d'écran de graphique fait typiquement 1600-1920px de large nativement — la
// redescendre à 1000px était la vraie cause du flou en zoomant, la qualité JPEG n'y changeait
// presque rien à côté de cette perte de résolution.
function compressImage(dataUrl, maxWidth = 1920, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let {width, height} = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // en cas d'échec, on garde l'original plutôt que de bloquer
    img.src = dataUrl;
  });
}

function addFormImage() {
  const inp = document.getElementById('f-img-input');
  if (!inp || !inp.files || !inp.files.length) return;
  Array.from(inp.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = async e => {
      const compressed = await compressImage(e.target.result);
      const finalSrc = await uploadTradeImageToR2(compressed);
      window._formImages.push(finalSrc);
      renderFormImages();
    };
    reader.readAsDataURL(file);
  });
  inp.value = '';
}
function renderFormImages() {
  const wrap = document.getElementById('f-images-wrap');
  if (!wrap) return;
  wrap.innerHTML = (window._formImages || [])
    .map(
      (src, i) => `<div style="position:relative;display:inline-block;margin:2px;">
    <img src="${src}" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #4f8ef7;cursor:zoom-in;" onclick="openFullscreen(this.src)">
    <button onclick="removeFormImg(${i})" style="position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:3px;padding:1px 4px;cursor:pointer;font-size:9px;">×</button>
  </div>`
    )
    .join('');
}
function removeFormImg(i) {
  const removed = (window._formImages || [])[i];
  if (typeof deleteTradeImageFromStorage === 'function') deleteTradeImageFromStorage(removed);
  window._formImages.splice(i, 1);
  renderFormImages();
}

// ══ INIT ══
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initStarPicker('f-stars-picker', 'f-stars', 0);
  initStarPicker('e-stars-picker', 'e-stars', 0);

  const mobileMenu = document.querySelector('.mobile-menu');
  if (mobileMenu) {
    const syncBtn = document.createElement('button');
    syncBtn.className = 'nav-tab';
    syncBtn.id = 'mobileSyncBtn';
    syncBtn.style.cssText =
      'font-size:14px;padding:14px 16px;border:1px solid var(--btn-save-bd);border-radius:6px;text-align:left;color:var(--btn-save-tx-mobile);background:var(--btn-save-bg-mobile);cursor:pointer;font-family:var(--mono);';
    syncBtn.textContent = 'SAUVEGARDE';
    syncBtn.onclick = () => {
      manualSyncSave();
    };
    mobileMenu.appendChild(syncBtn);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'nav-tab';
    logoutBtn.style.cssText =
      'font-size:14px;padding:14px 16px;border:1px solid #ef4444;border-radius:6px;text-align:left;color:#ef4444;background:none;cursor:pointer;font-family:var(--mono);';
    logoutBtn.textContent = '⏻ DÉCONNEXION';
    logoutBtn.onclick = () => {
      closeMobileMenu();
      resetPin();
    };
    mobileMenu.appendChild(logoutBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'nav-tab';
    exportBtn.style.cssText =
      'font-size:14px;padding:14px 16px;border:1px solid var(--btn-export-bd);border-radius:6px;text-align:left;color:var(--btn-export-tx);background:var(--btn-export-bg);cursor:pointer;font-family:var(--mono);';
    exportBtn.textContent = '⬇ EXPORTER UNE SAUVEGARDE';
    exportBtn.onclick = () => {
      exportLocalBackup();
    };

    const importBtn = document.createElement('button');
    importBtn.className = 'nav-tab';
    importBtn.style.cssText =
      'font-size:14px;padding:14px 16px;border:1px solid var(--btn-import-bd);border-radius:6px;text-align:left;color:var(--btn-import-tx);background:var(--btn-import-bg);cursor:pointer;font-family:var(--mono);';
    importBtn.textContent = '⬆ RESTAURER UNE SAUVEGARDE';
    importBtn.onclick = () => {
      document.getElementById('importBackupInput').click();
    };
  }
});

// Patch addTrade pour les images (appliqué après chargement)
document.addEventListener('DOMContentLoaded', () => {
  if (typeof addTrade === 'function') {
    const _origA = addTrade;
    window.addTrade = function () {
      const imgs = [...(window._formImages || [])];
      _origA();
      if (imgs.length && APP.trades.length) {
        APP.trades[0].images = imgs;
        window._formImages = [];
        renderFormImages();
        saveState();
        renderTable();
      }
    };
  }
});

// ══════════════════════════════════════════
// AGENT IA — RÉCAP MARCHÉS
// ══════════════════════════════════════════

// Animation shake pour les PIN incorrects
document.addEventListener('DOMContentLoaded', () => {
  const shakeStyle = document.createElement('style');
  shakeStyle.textContent =
    '@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}';
  document.head.appendChild(shakeStyle);
});

// ══════════════════════════════════════
// POINTS CLÉS IA INTERNE
// ══════════════════════════════════════
let _pcHistory = [];

// ══ TOP 5 / PIRES 5 TRADES ══
function renderTop5() {
  const rt = BT_STATE.top5 ? APP.trades : realTrades();
  const top5 = [...rt].sort((a, b) => (b.res || 0) - (a.res || 0)).slice(0, 5);
  const worst5 = [...rt].sort((a, b) => (a.res || 0) - (b.res || 0)).slice(0, 5);

  function tradeRow(t) {
    const pct = CAPITAL() > 0 ? (((t.res || 0) / CAPITAL()) * 100).toFixed(2) : '0.00';
    const col = (t.res || 0) >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div class="top5-row" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--top5-row-border);cursor:pointer;transition:background .15s;" onclick="openEditTrade(${t.id})" onmouseover="this.style.background='var(--row-hover)'" onmouseout="this.style.background='transparent'">
      <div>
        <div style="font-family:var(--mono);font-size:11px;">${t.paire || '—'} <span style="color:var(--muted);font-size:10px;">${t.date || ''}</span></div>
        <div style="font-size:10px;color:var(--muted);">${t.session || ''} ${t.tf || ''}</div>
      </div>
      <div style="text-align:right;font-family:var(--mono);font-size:12px;color:${col};">
        ${(t.res || 0) >= 0 ? '+' : ''}${(t.res || 0).toLocaleString('fr-FR')}€<br>
        <span style="font-size:10px;">${pct >= 0 ? '+' : ''}${pct}%</span>
      </div>
    </div>`;
  }

  const t5 = document.getElementById('top5trades');
  const w5 = document.getElementById('worst5trades');
  if (t5)
    t5.innerHTML = top5.length
      ? top5.map(tradeRow).join('')
      : '<div style="color:var(--muted);font-size:12px;">Aucun trade</div>';
  if (w5)
    w5.innerHTML = worst5.length
      ? worst5.map(tradeRow).join('')
      : '<div style="color:var(--muted);font-size:12px;">Aucun trade</div>';
}

// ══════════════════════════════════════
// POINTS CLÉS IA INTERNE
// ══════════════════════════════════════

function renderPcHistory() {
  const history = JSON.parse(localStorage.getItem(profileKey('tjp_pc_history')) || '[]');
  const wrap = document.getElementById('pcHistory');
  if (!wrap) return;
  if (!history.length) {
    wrap.innerHTML =
      '<div style="color:var(--muted);font-size:12px;">Aucune analyse sauvegardée.</div>';
    return;
  }
  wrap.innerHTML = history
    .map(
      (h, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="loadPcFromHistory(${i})">
      <div style="flex:1;font-family:var(--mono);font-size:11px;">${h.date}</div>
      <button onclick="event.stopPropagation();deletePcHistory(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;">🗑</button>
    </div>`
    )
    .join('');
}

function loadPcFromHistory(i) {
  const history = JSON.parse(localStorage.getItem(profileKey('tjp_pc_history')) || '[]');
  if (history[i]) renderPcCards(history[i].cards);
}

function deletePcHistory(i) {
  const history = JSON.parse(localStorage.getItem(profileKey('tjp_pc_history')) || '[]');
  history.splice(i, 1);
  localStorage.setItem(profileKey('tjp_pc_history'), JSON.stringify(history));
  renderPcHistory();
  if (typeof scheduleGlobalChatPush === 'function') scheduleGlobalChatPush();
}

function renderPcCards(data) {
  // data = { positifs: [{titre,points}], negatifs: [{titre,points}], resume: string }
  const wrap = document.getElementById('pcCards');
  if (!wrap) return;

  let html2 = '';

  // Bloc positifs
  if (data.positifs && data.positifs.length) {
    html2 += `<div class="card" style="border:1px solid var(--pc-positif);margin:0;">
      <div class="card-header" style="background:color-mix(in srgb, var(--pc-positif) 7%, transparent);">
        <div class="card-title" style="color:var(--pc-positif)" data-editable><span class="deco-emoji">✅</span> POINTS CLÉS POSITIFS</div>
      </div>
      <div class="card-body">
        ${data.positifs
          .map(
            item => `
          <div style="margin-bottom:10px;">
            <div style="font-family:var(--mono);font-size:10px;color:var(--pc-positif);margin-bottom:4px;">${item.titre}</div>
            ${(item.points || [])
              .map(
                p => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:3px;">
              <span style="color:var(--pc-positif);font-size:10px;margin-top:2px;">▸</span>
              <span style="font-size:12px;color:var(--text);line-height:1.5;">${p}</span>
            </div>`
              )
              .join('')}
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  // Bloc négatifs
  if (data.negatifs && data.negatifs.length) {
    html2 += `<div class="card" style="border:1px solid var(--pc-negatif);margin:0;">
      <div class="card-header" style="background:color-mix(in srgb, var(--pc-negatif) 7%, transparent);">
        <div class="card-title" style="color:var(--pc-negatif)" data-editable><span class="deco-emoji">⚠️</span> POINTS CLÉS À AMÉLIORER</div>
      </div>
      <div class="card-body">
        ${data.negatifs
          .map(
            item => `
          <div style="margin-bottom:10px;">
            <div style="font-family:var(--mono);font-size:10px;color:var(--pc-negatif);margin-bottom:4px;">${item.titre}</div>
            ${(item.points || [])
              .map(
                p => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:3px;">
              <span style="color:var(--pc-negatif);font-size:10px;margin-top:2px;">▸</span>
              <span style="font-size:12px;color:var(--text);line-height:1.5;">${p}</span>
            </div>`
              )
              .join('')}
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  // Résumé pleine largeur
  if (data.resume) {
    html2 += `<div class="card" style="grid-column:1/-1;margin:0;border:1px solid var(--pc-resume-border);">
      <div class="card-header"><div class="card-title" data-editable data-tvar="--crt-resume" style="color:var(--crt-resume,#00e5a0)"><span class="deco-emoji">📋</span> RÉSUMÉ & RECOMMANDATIONS</div></div>
      <div class="card-body" style="font-size:13px;line-height:1.8;color:var(--text);">${data.resume}</div>
    </div>`;
  }

  wrap.innerHTML = html2;
  document.getElementById('pcContent').style.display = 'block';
  document.getElementById('pcStatus').style.display = 'none';
  applyPencilEdits();
  setupPencil();
}

async function generatePointsCles() {
  const btn = document.getElementById('pcGenBtn');
  if (!btn) return;
  const trades = BT_STATE.pc ? APP.trades : realTrades();
  if (!trades.length) {
    document.getElementById('pcStatus').textContent = 'Aucun trade dans le journal.';
    document.getElementById('pcStatus').style.color = 'var(--red)';
    document.getElementById('pcStatus').style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Analyse...';
  document.getElementById('pcStatus').textContent = 'Analyse de ' + trades.length + ' trades...';
  document.getElementById('pcStatus').style.color = 'var(--muted)';
  document.getElementById('pcStatus').style.display = 'block';
  document.getElementById('pcContent').style.display = 'none';

  // ── Stats complètes ──
  const total = trades.length;
  const winners = trades.filter(t => (t.res || 0) > 0);
  const losers = trades.filter(t => (t.res || 0) < 0);
  const totalPnl = trades.reduce((s, t) => s + (t.res || 0), 0);
  const wr = total > 0 ? ((winners.length / total) * 100).toFixed(1) : 0;
  const avgWin = winners.length
    ? (winners.reduce((s, t) => s + t.res, 0) / winners.length).toFixed(2)
    : 0;
  const avgLoss = losers.length
    ? (losers.reduce((s, t) => s + t.res, 0) / losers.length).toFixed(2)
    : 0;
  const gw = winners.reduce((s, t) => s + t.res, 0);
  const gl = Math.abs(losers.reduce((s, t) => s + t.res, 0));
  const pf = gl > 0 ? (gw / gl).toFixed(2) : '∞';

  const stat = (arr, key) => {
    const m = {};
    arr.forEach(t => {
      const vals = t[key] ? (key === 'tf' || key === 'conf' ? t[key].split(/[|,]/) : [t[key]]) : [];
      vals.forEach(v => {
        v = v.trim();
        if (!v) return;
        if (!m[v]) m[v] = {pnl: 0, n: 0, w: 0};
        m[v].pnl += t.res || 0;
        m[v].n++;
        if ((t.res || 0) > 0) m[v].w++;
      });
    });
    return Object.entries(m).sort((a, b) => b[1].pnl - a[1].pnl);
  };

  const byPaire = stat(trades, 'paire');
  const bySess = stat(trades, 'session');
  const byTF = stat(trades, 'tf');
  const byConf = stat(trades, 'conf');
  const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const byDay = stat(
    trades.map(t => ({...t, day: t.date ? jours[new Date(t.date).getDay()] : '?'})),
    'day'
  );
  const worstDay = byDay.filter(([, d]) => d.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl);

  let maxWS = 0,
    curWS = 0,
    maxLS = 0,
    curLS = 0;
  [...trades]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.heure || '').localeCompare(b.heure || ''))
    .forEach(t => {
      if ((t.res || 0) > 0) {
        curWS++;
        maxWS = Math.max(maxWS, curWS);
        curLS = 0;
      } else if ((t.res || 0) < 0) {
        curLS++;
        maxLS = Math.max(maxLS, curLS);
        curWS = 0;
      }
    });

  const cap = CAPITAL();
  let peak = cap,
    runCap = cap,
    maxDD = 0;
  trades.forEach(t => {
    runCap += t.res || 0;
    if (runCap > peak) peak = runCap;
    const dd = ((peak - runCap) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  });

  // ── Construire les points ──
  const positifs = [];
  const negatifs = [];

  // Positifs — Performance globale
  const pp = [];
  if (parseFloat(wr) >= 50) pp.push(`Win rate de ${wr}% sur ${total} trades`);
  if (parseFloat(pf) >= 1.5) pp.push(`Profit factor excellent : ${pf}`);
  if (totalPnl > 0)
    pp.push(
      `Compte en hausse : +${totalPnl.toFixed(2)}€ (+${((totalPnl / cap) * 100).toFixed(1)}%)`
    );
  if (maxWS >= 3) pp.push(`Serie gagnante max : ${maxWS} trades consecutifs`);
  if (pp.length) positifs.push({titre: 'PERFORMANCE GLOBALE', points: pp.slice(0, 4)});

  // Positifs — Paires rentables
  const pppaire = byPaire
    .filter(([, d]) => d.pnl > 0)
    .slice(0, 4)
    .map(
      ([p, d]) =>
        `${p} : +${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades`
    );
  if (pppaire.length) positifs.push({titre: 'PAIRES RENTABLES', points: pppaire});

  // Positifs — Sessions performantes
  const ppsess = bySess
    .filter(([, d]) => d.pnl > 0)
    .slice(0, 3)
    .map(
      ([s, d]) =>
        `Session ${s} : +${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades`
    );
  if (ppsess.length) positifs.push({titre: 'SESSIONS PERFORMANTES', points: ppsess});

  // Positifs — Timeframes efficaces
  const ptf = byTF
    .filter(([, d]) => d.pnl > 0)
    .slice(0, 4)
    .map(
      ([tf, d]) =>
        `TF ${tf} : ${((d.w / d.n) * 100).toFixed(0)}% WR, +${d.pnl.toFixed(0)}€ (${d.n} trades)`
    );
  if (ptf.length) positifs.push({titre: 'TIMEFRAMES EFFICACES', points: ptf});

  // Positifs — Confluences qui marchent (analyse dédiée et complète)
  const ppconf = byConf
    .filter(([, d]) => d.pnl > 0 && d.n >= 2)
    .slice(0, 4)
    .map(
      ([c, d]) =>
        `"${c}" : ${((d.w / d.n) * 100).toFixed(0)}% WR, +${d.pnl.toFixed(0)}€ sur ${d.n} trades`
    );
  if (ppconf.length) positifs.push({titre: 'CONFLUENCES QUI FONCTIONNENT', points: ppconf});

  // Positifs — Jours où il est rentable de trader davantage
  const bestDays = byDay
    .filter(([, d]) => d.pnl > 0 && d.n >= 1)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 4)
    .map(
      ([day, d]) =>
        `${day} : +${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades — bon jour pour augmenter le volume`
    );
  if (bestDays.length) positifs.push({titre: 'JOURS OU TRADER DAVANTAGE', points: bestDays});

  // Positifs — Régularité / discipline (basé sur drawdown et séries)
  const ppreg = [];
  if (maxDD <= 10 && total >= 5)
    ppreg.push(`Drawdown maitrise : ${maxDD.toFixed(1)}% max, bonne gestion du risque`);
  if (maxLS <= 2 && total >= 5)
    ppreg.push(`Pas de serie de pertes problematique (max ${maxLS} pertes d'affilee)`);
  const mgmtStat = stat(trades, 'mgmt').filter(([k]) => k && k.toLowerCase() !== 'non');
  mgmtStat
    .filter(([, d]) => d.pnl > 0 && d.n >= 2)
    .slice(0, 2)
    .forEach(([m, d]) =>
      ppreg.push(
        `Gestion "${m}" rentable : +${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR`
      )
    );
  if (ppreg.length) positifs.push({titre: 'DISCIPLINE & REGULARITE', points: ppreg});

  // Négatifs — Problèmes identifiés
  const pn = [];
  if (parseFloat(wr) < 50) pn.push(`Win rate faible : ${wr}% — viser 50%+`);
  if (parseFloat(pf) < 1) pn.push(`Profit factor < 1 (${pf}) : les pertes depassent les gains`);
  if (totalPnl < 0) pn.push(`Compte en baisse : ${totalPnl.toFixed(2)}€`);
  if (maxDD > 10) pn.push(`Drawdown max eleve : ${maxDD.toFixed(1)}%`);
  if (maxLS >= 3) pn.push(`Serie perdante max : ${maxLS} — risque de revenge trading`);
  if (Math.abs(parseFloat(avgLoss)) > parseFloat(avgWin) * 1.5)
    pn.push(`Pertes moyennes (${avgLoss}€) trop grandes vs gains (${avgWin}€)`);
  if (pn.length) negatifs.push({titre: 'PROBLEMES IDENTIFIES', points: pn.slice(0, 4)});

  const pnpaire = byPaire
    .filter(([, d]) => d.pnl < 0)
    .slice(0, 3)
    .map(
      ([p, d]) =>
        `Reduire ou arreter ${p} : ${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR`
    );
  if (pnpaire.length) negatifs.push({titre: 'PAIRES A EVITER', points: pnpaire});

  const pnsess = bySess
    .filter(([, d]) => d.pnl < 0)
    .slice(0, 3)
    .map(
      ([s, d]) =>
        `Session ${s} deficitaire : ${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades`
    );
  if (pnsess.length) negatifs.push({titre: 'SESSIONS A EVITER', points: pnsess});

  const pntf = byTF
    .filter(([, d]) => d.pnl < 0)
    .slice(0, 3)
    .map(
      ([tf, d]) => `Arreter TF ${tf} : ${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR`
    );
  if (pntf.length) negatifs.push({titre: 'TIMEFRAMES DEFICITAIRES', points: pntf});

  const pnday = worstDay
    .slice(0, 3)
    .map(
      ([day, d]) =>
        `Ne pas trader le ${day} : ${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades`
    );
  if (pnday.length) negatifs.push({titre: 'JOURS A EVITER', points: pnday});

  const pnconf = byConf
    .filter(([, d]) => d.pnl < 0 && d.n >= 2)
    .slice(0, 4)
    .map(
      ([c, d]) =>
        `"${c}" peu fiable : ${d.pnl.toFixed(0)}€, ${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades`
    );
  if (pnconf.length) negatifs.push({titre: 'CONFLUENCES INEFFICACES', points: pnconf});

  // Résumé
  const resume =
    `<strong>Win Rate :</strong> ${wr}% | <strong>P&L :</strong> ${totalPnl > 0 ? '+' : ''}${totalPnl.toFixed(2)}€ | <strong>Profit Factor :</strong> ${pf} | <strong>Drawdown max :</strong> ${maxDD.toFixed(1)}%<br><br>` +
    (byPaire[0]
      ? `<strong>Meilleure paire :</strong> ${byPaire[0][0]} (+${byPaire[0][1].pnl.toFixed(0)}€)` +
        (byPaire[byPaire.length - 1][1].pnl < 0
          ? ` | <strong>Pire paire :</strong> ${byPaire[byPaire.length - 1][0]} (${byPaire[byPaire.length - 1][1].pnl.toFixed(0)}€)`
          : '') +
        '<br>'
      : '') +
    (bySess[0]
      ? `<strong>Meilleure session :</strong> ${bySess[0][0]} (+${bySess[0][1].pnl.toFixed(0)}€)<br>`
      : '') +
    (bestDays.length
      ? `<strong>Jours a privilegier :</strong> ${byDay
          .filter(([, d]) => d.pnl > 0)
          .sort((a, b) => b[1].pnl - a[1].pnl)
          .slice(0, 2)
          .map(([d]) => d)
          .join(', ')}<br>`
      : '') +
    (worstDay.length
      ? `<strong>Jours a eviter :</strong> ${worstDay
          .slice(0, 2)
          .map(([d]) => d)
          .join(', ')}<br>`
      : '') +
    `<br><strong>Action prioritaire :</strong> ${
      parseFloat(wr) < 50
        ? 'Ameliorer la selection des entrees pour atteindre 50%+ de win rate.'
        : parseFloat(pf) < 1.2
          ? 'Couper les pertes plus tot pour ameliorer le profit factor.'
          : maxDD > 15
            ? 'Mettre en place un stop journalier pour limiter le drawdown.'
            : pntf.length
              ? `Arreter de trader sur les TF deficitaires (${byTF
                  .filter(([, d]) => d.pnl < 0)
                  .map(([tf]) => tf)
                  .join(', ')}).`
              : 'Continuer la strategie actuelle et augmenter progressivement la taille.'
    }`;

  const result = {positifs, negatifs, resume};
  renderPcCards(result);

  // Sauvegarder
  const history = JSON.parse(localStorage.getItem(profileKey('tjp_pc_history')) || '[]');
  history.unshift({date: new Date().toLocaleString('fr-FR'), cards: result});
  if (history.length > 10) history.pop();
  localStorage.setItem(profileKey('tjp_pc_history'), JSON.stringify(history));
  renderPcHistory();
  if (typeof scheduleGlobalChatPush === 'function') scheduleGlobalChatPush();

  btn.disabled = false;
  btn.textContent = 'Analyser ma strategie';
}

// ══════════════════════════════════════
// ASSISTANT JOURNAL — CHAT IA AVEC CONVERSATIONS MULTIPLES
// ══════════════════════════════════════
// Structure stockée : tjp_pc_conversations = [{ id, title, messages: [{role,text}], updatedAt }]
// tjp_pc_active_conv = id de la conversation actuellement affichée

function pcLoadConversations() {
  try {
    return JSON.parse(localStorage.getItem(profileKey('tjp_pc_conversations')) || '[]');
  } catch (e) {
    return [];
  }
}
function pcSaveConversations(convs) {
  localStorage.setItem(profileKey('tjp_pc_conversations'), JSON.stringify(convs));
  if (typeof scheduleGlobalChatPush === 'function') scheduleGlobalChatPush();
}
function pcGetActiveConvId() {
  return localStorage.getItem(profileKey('tjp_pc_active_conv')) || null;
}
function pcSetActiveConvId(id) {
  localStorage.setItem(profileKey('tjp_pc_active_conv'), id || '');
  if (typeof scheduleGlobalChatPush === 'function') scheduleGlobalChatPush();
}

let pcConversations = pcLoadConversations();
let pcActiveConvId = pcGetActiveConvId();

// Migration douce : si l'ancien format mono-conversation existe et qu'il n'y a pas encore
// de conversations dans le nouveau système, on le convertit en première conversation.
(function pcMigrateOldChat() {
  const old = localStorage.getItem(profileKey('tjp_pc_chat'));
  if (old && !pcConversations.length) {
    try {
      const oldMsgs = JSON.parse(old).filter(m => !/pc-thinking/.test(m.text));
      if (oldMsgs.length) {
        const conv = {
          id: 'conv-' + Date.now(),
          title: pcDeriveTitle(oldMsgs),
          messages: oldMsgs,
          updatedAt: Date.now()
        };
        pcConversations = [conv];
        pcSaveConversations(pcConversations);
        pcActiveConvId = conv.id;
        pcSetActiveConvId(conv.id);
      }
    } catch (e) {}
    localStorage.removeItem(profileKey('tjp_pc_chat'));
  }
})();

function pcDeriveTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'Nouvelle conversation';
  const plain = (firstUser.plainText || firstUser.text.replace(/<[^>]+>/g, '')).trim();
  return plain.length > 40 ? plain.slice(0, 40) + '…' : plain || 'Nouvelle conversation';
}

function pcGetActiveConv() {
  return pcConversations.find(c => c.id === pcActiveConvId) || null;
}

function pcGetActiveMessages() {
  const conv = pcGetActiveConv();
  return conv ? conv.messages : [];
}

function pcUpdateChatTitleBar() {
  const bar = document.getElementById('pcChatTitleBar');
  if (!bar) return;
  const conv = pcGetActiveConv();
  bar.textContent = conv ? conv.title : 'Nouvelle conversation';
}

// ── Assainissement des messages du chat IA avant injection dans le DOM ──
// L'IA distante peut citer du texte saisi par l'utilisateur (notes de trade,
// noms de paires personnalisés...) dans sa réponse. Ce texte n'a jamais été
// conçu pour être du HTML : un simple "<1.05" ou "<TP1" dans une note suffit
// à casser le rendu, et un contenu construit intentionnellement pourrait aller
// jusqu'à exécuter du script. On n'échappe donc jamais m.text brut dans le DOM :
// on le fait passer par DOMPurify, qui n'autorise que le strict nécessaire pour
// la mise en forme déjà utilisée ailleurs dans ce fichier (indicateur "réflexion
// en cours", saut de ligne du repli local) + les miniatures d'images envoyées à
// l'IA (pcImagesHtml). "img"/"src" sont autorisés, mais AUCUN attribut "on*"
// (onclick compris) ne l'est : le zoom au clic passe par un écouteur délégué
// (cf. plus bas), jamais par un attribut inline, qui serait de toute façon retiré.
const PC_CHAT_ALLOWED_TAGS = ['br', 'strong', 'em', 'b', 'i', 'span', 'div', 'img'];
const PC_CHAT_ALLOWED_ATTR = ['id', 'class', 'style', 'src', 'title'];
function pcSanitizeChatHtml(html) {
  const raw = String(html == null ? '' : html);
  if (typeof DOMPurify === 'undefined') {
    console.warn('DOMPurify indisponible : repli sur un texte intégralement échappé.');
    return escapeHtml(raw);
  }
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: PC_CHAT_ALLOWED_TAGS,
    ALLOWED_ATTR: PC_CHAT_ALLOWED_ATTR
  });
}

// Zoom des miniatures IA affichées dans le chat (délégation sur le document,
// donc pas besoin d'attribut onclick inline — qui serait de toute façon retiré
// par pcSanitizeChatHtml ci-dessus). Réutilise le visualiseur plein écran
// zoomable existant (openFullscreen).
document.addEventListener('click', e => {
  const img = e.target.closest('.pc-msg-img');
  if (!img) return;
  // Miniatures d'une fiche de trade : galerie complète (flèches + bandeau), comme dans « Modifier le trade »
  const wrap = img.closest('.fc-trade-imgs');
  if (wrap) {
    const imgs = Array.from(wrap.querySelectorAll('.pc-msg-img'));
    const srcs = imgs.map(i => i.src);
    openFullscreen(img.src, srcs, Math.max(0, imgs.indexOf(img)));
  } else openFullscreen(img.src);
});

// Construit le HTML (sûr pour pcSanitizeChatHtml) des miniatures à afficher sous
// un message du chat IA, pour montrer exactement quelles images ont été envoyées
// pour cette question.
function pcImagesHtml(images) {
  if (!images || !images.length) return '';
  return (
    '<span style="display:block;margin-top:8px;">' +
    images
      .map(
        im =>
          `<img class="pc-msg-img" src="${im.dataUrl}" title="${escapeHtml(im.label || '')}" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #4f8ef7;cursor:zoom-in;margin:0 6px 6px 0;">`
      )
      .join('') +
    '</span>'
  );
}

function renderPcChat() {
  const box = document.getElementById('pcChatMessages');
  if (!box) return;
  const messages = pcGetActiveMessages();
  pcUpdateChatTitleBar();
  if (!messages.length) {
    const pseudo = typeof getProfile === 'function' ? getProfile().pseudo : '';
    box.innerHTML =
      '<div class="pc-msg-empty">Bonjour ' +
      escapeHtml(pseudo) +
      ", comment puis-je t'aider ?</div>";
    return;
  }
  box.innerHTML = messages
    .map(
      m =>
        `<div class="pc-msg ${m.role === 'user' ? 'pc-msg-user' : 'pc-msg-bot'}">${pcSanitizeChatHtml(m.text)}</div>`
    )
    .join('');
  box.scrollTop = box.scrollHeight;
}

function pcPushMsg(role, text, plainText) {
  let conv = pcGetActiveConv();
  if (!conv) {
    conv = {
      id: 'conv-' + Date.now(),
      title: 'Nouvelle conversation',
      messages: [],
      updatedAt: Date.now()
    };
    pcConversations.unshift(conv);
    pcActiveConvId = conv.id;
    pcSetActiveConvId(conv.id);
  }
  const msg = {role, text};
  if (plainText) msg.plainText = plainText;
  conv.messages.push(msg);
  if (conv.messages.length > 60) conv.messages = conv.messages.slice(-60);
  if (conv.title === 'Nouvelle conversation') conv.title = pcDeriveTitle(conv.messages);
  conv.updatedAt = Date.now();
  pcSaveConversations(pcConversations);
  renderPcChat();
}

// ─── Gestion du panneau latéral des conversations ───
function pcOpenConvPanel() {
  pcRenderConvList();
  document.getElementById('pcConvOverlay').classList.add('open');
  document.getElementById('pcConvPanel').classList.add('open');
}
function pcCloseConvPanel() {
  document.getElementById('pcConvOverlay').classList.remove('open');
  document.getElementById('pcConvPanel').classList.remove('open');
}

function pcRenderConvList() {
  const list = document.getElementById('pcConvList');
  if (!list) return;
  // Une "Nouvelle conversation" jamais entamée (aucun message) ne doit pas
  // apparaître dans l'historique — seulement une fois qu'elle contient au
  // moins un message (18/09/2026, demande de Paul). Elle reste malgré tout
  // la conversation active affichée dans le chat, juste absente de cette
  // liste tant qu'elle est vide.
  const withMessages = pcConversations.filter(c => c.messages && c.messages.length > 0);
  if (!withMessages.length) {
    list.innerHTML = '<div class="pc-conv-empty">Aucune conversation pour le moment.</div>';
    return;
  }
  const sorted = [...withMessages].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  list.innerHTML = sorted
    .map(
      c => `
    <div class="pc-conv-item ${c.id === pcActiveConvId ? 'active' : ''}" onclick="pcSelectConversation('${c.id}')">
      <div class="pc-conv-item-title">${escapeHtml(c.title)}</div>
      <div class="pc-conv-item-del" onclick="event.stopPropagation();pcDeleteConversation('${c.id}')" title="Supprimer">🗑</div>
    </div>`
    )
    .join('');
}

function pcSelectConversation(id) {
  pcActiveConvId = id;
  pcSetActiveConvId(id);
  renderPcChat();
  pcCloseConvPanel();
}

// Démarre une conversation IA fraîche à chaque nouvelle connexion (PIN validé).
// L'ancienne conversation active reste dans pcConversations, donc visible dans l'historique.
function pcStartFreshSessionConversation() {
  // Ne crée une nouvelle conversation que si l'actuelle contient déjà des messages
  // (évite d'empiler des conversations vides si l'utilisateur se reconnecte sans avoir rien tapé)
  const active = pcConversations.find(c => c.id === pcActiveConvId);
  if (active && active.messages && active.messages.length === 0) return;
  const conv = {
    id: 'conv-' + Date.now(),
    title: 'Nouvelle conversation',
    messages: [],
    updatedAt: Date.now()
  };
  pcConversations.unshift(conv);
  pcSaveConversations(pcConversations);
  pcActiveConvId = conv.id;
  pcSetActiveConvId(conv.id);
}

function pcNewConversation() {
  // Si la conversation active est déjà une "Nouvelle conversation" jamais
  // entamée (aucun message), on ne fait rien : le bouton "+" reste affiché
  // et cliquable, mais ne doit pas empiler une deuxième conversation vide
  // par-dessus celle déjà en cours (18/09/2026, demande de Paul).
  const active = pcGetActiveConv();
  if (active && (!active.messages || active.messages.length === 0)) return;
  const conv = {
    id: 'conv-' + Date.now(),
    title: 'Nouvelle conversation',
    messages: [],
    updatedAt: Date.now()
  };
  pcConversations.unshift(conv);
  pcSaveConversations(pcConversations);
  pcActiveConvId = conv.id;
  pcSetActiveConvId(conv.id);
  renderPcChat();
  pcCloseConvPanel();
}

function pcDeleteConversation(id) {
  pcConversations = pcConversations.filter(c => c.id !== id);
  pcSaveConversations(pcConversations);
  if (pcActiveConvId === id) {
    // Bascule sur la conversation la plus récente restante, ou repart à vide
    const next = [...pcConversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    pcActiveConvId = next ? next.id : null;
    pcSetActiveConvId(pcActiveConvId);
    renderPcChat();
  }
  pcRenderConvList();
}

// URL de la fonction Supabase qui fait le pont vers Gemini (clé secrète côté serveur)
const PC_AI_ENDPOINT = 'https://ghjashqgwlaofjubzrcp.supabase.co/functions/v1/hyper-task';
const PC_SUPABASE_ANON_KEY = 'sb_publishable_v_Uc1c_TsGyA7ieZPfaGnw_Ajknc7af';

// Prépare une version complète des trades à envoyer à l'IA (sans données binaires lourdes —
// les images sont gérées séparément par pcPrepareImagesForAI). Aucune donnée n'est filtrée ou
// tronquée : chaque trade inclut aussi le capital et le % de risque qui étaient RÉELLEMENT actifs
// au moment précis où il a été pris (mêmes valeurs historiques que celles utilisées pour calculer
// le RR réalisé — voir computeRR/getRiskHistMap dans app-part1.js).
function pcPrepareTradesForAI(trades) {
  const histMap = typeof getRiskHistMap === 'function' ? getRiskHistMap() : null;
  return (trades || []).map(t => {
    const h = histMap && !t.backtest && t.id !== undefined ? histMap.get(t.id) : null;
    const capAvant = h ? h.capUsed : null;
    const capApres = capAvant !== null && capAvant !== undefined ? capAvant + (t.res || 0) : null;
    return {
      id: t.id,
      backtest: !!t.backtest,
      date: t.date || null,
      heure: t.heure || null,
      paire: t.paire || null,
      session: t.session || null,
      tf: t.tf || null,
      conf: t.conf || null,
      direction: t.dir || null,
      resultatEur: typeof t.res === 'number' ? t.res : null,
      rrCible: t.rrCible || null,
      rrReel: typeof computeRR === 'function' ? computeRR(t) : null,
      rrMode: t.rrAuto === false ? 'manuel' : 'auto',
      rrPrisManuel: t.rrAuto === false ? t.rrPris : null,
      risquePourcentAuMomentDuTrade: h ? h.rpUsed : null,
      capitalAvantCeTrade: capAvant,
      capitalApresCeTrade: capApres,
      management: t.mgmt || null,
      reprendrait: t.reprend || null,
      notes: t.notes ? String(t.notes) : null,
      nbImages: t.images && t.images.length ? t.images.length : 0,
      stars: t.stars || null
    };
  });
}

// Contexte global du compte (réglages + état actuel) — envoyé une seule fois par requête,
// en plus de la liste des trades, pour que l'IA ait toute l'image du compte sans exception.
function pcPrepareAccountContext() {
  const totalPO = lsAcc('tj_payouts', []).reduce((s, p) => s + (p.amount || 0), 0);
  return {
    capitalDepart: CAPITAL(),
    risqueBasePct: RBASE(),
    risqueMaxPct: RMAX(),
    smartRiskActif: !!SMART(),
    reglesHausseRisque: {
      declencheur: RM_UP_TRIGGER(),
      nbTrades: RM_UP_TRADES(),
      pourcentGain: RM_UP_PCT(),
      typeVariation: RM_UP_VAR_TYPE(),
      valeurVariation: RM_UP_VAR_VAL()
    },
    reglesBaisseRisque: {
      declencheur: RM_DOWN_TRIGGER(),
      nbTrades: RM_DOWN_TRADES(),
      pourcentPerte: RM_DOWN_PCT(),
      typeVariation: RM_DOWN_VAR_TYPE(),
      valeurVariation: RM_DOWN_VAR_VAL()
    },
    capitalActuel: getCurrentCap(),
    risqueActuelPct: getCurrentRiskPct(),
    risqueActuelEur: getCurrentRiskEur(),
    totalPayoutsRetires: totalPO,
    drawdownMaxPct: typeof computeMaxDrawdown === 'function' ? computeMaxDrawdown() : null,
    pertesConsecutivesMax: typeof computeWorstLose === 'function' ? computeWorstLose() : null,
    listesPersonnalisables: {
      confluences: APP.lists.confluences || [],
      typesManagement: APP.lists.mgmt_opts || [],
      optionsReprendrait: APP.lists.reprend_opts || [],
      paires: APP.lists.paires || [],
      sessions: APP.lists.sessions || []
    }
  };
}

// Convertit l'historique de chat (avec HTML) en texte brut pour l'IA, en excluant les indicateurs de chargement
function pcHistoryForAI(history) {
  return (history || [])
    .filter(m => !/pc-thinking/.test(m.text))
    .slice(-10) // les derniers échanges suffisent pour le contexte
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.plainText || m.text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    }));
}

// Extrait un échantillon raisonnable d'images de trades (les plus récentes) pour l'IA,
// avec leur contexte (date/paire/résultat), pour rester dans des limites de taille/coût acceptables.
// NB : les graphiques Track Record (Chart.js) ne sont volontairement PAS envoyés à l'IA —
// seules les images jointes aux trades le sont.
function pcPrepareImagesForAI(trades, maxImages = 8) {
  const sorted = [...(trades || [])]
    .filter(t => t.images && t.images.length)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const out = [];
  for (const t of sorted) {
    for (const img of t.images) {
      if (out.length >= maxImages) break;
      if (typeof img !== 'string' || !img.startsWith('data:image')) continue;
      out.push({
        date: t.date || null,
        paire: t.paire || null,
        res: typeof t.res === 'number' ? t.res : null,
        dataUrl: img
      });
    }
    if (out.length >= maxImages) break;
  }
  return out;
}

async function pcAskAI(question, trades, history) {
  const isCloud = !!(currentUser && currentUser.id);
  let authToken = PC_SUPABASE_ANON_KEY;
  let payload = {
    question,
    history: pcHistoryForAI(history),
    acc_id: _currentAccId // indispensable côté serveur pour cibler la bonne ligne journal_data
  };

  let pushOk = true;
  if (isCloud) {
    // Compte cloud : on s'assure que journal_data est à jour côté serveur (le push est un
    // no-op si rien n'a changé), puis on envoie le VRAI token de l'utilisateur — c'est lui qui
    // permet à la fonction Edge d'aller chercher les données elle-même via ses outils, plutôt
    // que de les recevoir poussées ici. On n'envoie donc pas trades/compte/images de trades
    // dans ce cas : l'IA peut demander get_trades puis get_trade_images (TOUS les trades sont
    // potentiellement accessibles, pas juste un échantillon de 8) si elle en a besoin.
    // MAIS si cette synchro échoue, la ligne côté serveur peut être périmée ou vide (l'IA
    // répondrait alors "aucun trade trouvé" alors qu'ils existent bien en local) : dans ce
    // cas on bascule sur l'envoi direct ci-dessous plutôt que de faire confiance au serveur.
    try {
      pushOk = await pushToCloud();
    } catch (e) {
      console.warn('Sync avant question IA impossible :', e);
      pushOk = false;
    }
    try {
      const {data: sessionData} = await sb.auth.getSession();
      if (sessionData?.session?.access_token) authToken = sessionData.session.access_token;
    } catch (e) {
      console.warn('Session introuvable, repli sur envoi direct des données :', e);
    }
  }
  if (!isCloud || authToken === PC_SUPABASE_ANON_KEY || !pushOk) {
    // Pas de compte cloud, session indisponible, ou synchro pré-question échouée : repli sur
    // l'envoi direct, les données et un échantillon d'images partent dans la requête
    // (impossible d'aller chercher plus à la demande sans compte cloud à jour).
    payload.compte = pcPrepareAccountContext();
    payload.trades = pcPrepareTradesForAI(trades);
    payload.images = pcPrepareImagesForAI(trades);
  }

  const res = await fetch(PC_AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + authToken
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  // Images réellement jointes à CETTE requête (celles que l'IA a pu regarder) : l'échantillon
  // de trades du repli local ci-dessus, OU (compte cloud) les images que l'IA est allée
  // chercher elle-même via get_trade_images — la fonction Edge nous les renvoie maintenant
  // dans data.images pour qu'on puisse les montrer dans le chat.
  const images = [
    ...(payload.images || []).map(im => ({
      label: [im.paire, im.date].filter(Boolean).join(' · '),
      dataUrl: im.dataUrl
    })),
    ...(data.images || []).map(im => ({
      label: [im.paire, im.date].filter(Boolean).join(' · '),
      dataUrl: im.dataUrl
    }))
  ];
  return {answer: data.answer, images};
}

async function sendPcMessage() {
  const input = document.getElementById('pcQuestion');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';

  // Capture l'historique AVANT d'ajouter le nouveau message, pour ne pas se citer soi-même
  const historySnapshot = pcGetActiveMessages().slice();

  pcPushMsg('user', escapeHtml(q));

  const thinkingId = 'pc-thinking-' + Date.now();
  const conv = pcGetActiveConv();
  conv.messages.push({
    role: 'bot',
    text: `<span id="${thinkingId}" class="pc-thinking">${stripDecoEmoji('🤔 Réflexion en cours...')}</span>`
  });
  renderPcChat();

  const trades = APP.trades || [];
  let answer;
  let images = [];
  try {
    const result = await pcAskAI(q, trades, historySnapshot);
    answer = result.answer;
    images = result.images || [];
  } catch (err) {
    console.warn('Agent IA indisponible, bascule sur le moteur local :', err);
    answer =
      pcAnalyze(q) +
      '<br><br><span style="opacity:.6;font-size:.85em;">(réponse générée en local, l\'assistant IA est momentanément indisponible)</span>';
  }

  // Miniatures des images envoyées/montrées à l'IA pour cette question, pour qu'on voie
  // exactement ce qu'elle a pu analyser. Seules les vraies images en base64 (repli local)
  // sont recompressées avant d'être conservées dans l'historique, pour ne pas alourdir le
  // stockage local — une URL de storage cloud est déjà juste un lien, rien à compresser.
  let imagesHtml = '';
  if (images.length) {
    try {
      const thumbs = await Promise.all(
        images.map(im =>
          typeof im.dataUrl === 'string' && im.dataUrl.startsWith('data:image')
            ? compressImage(im.dataUrl, 480, 0.75)
            : Promise.resolve(im.dataUrl)
        )
      );
      imagesHtml = pcImagesHtml(images.map((im, i) => ({label: im.label, dataUrl: thumbs[i]})));
    } catch (e) {
      console.warn('Miniatures des images IA impossibles à générer :', e);
    }
  }

  // Remplace le message "réflexion en cours" par la vraie réponse
  const idx = conv.messages.findIndex(m => m.text.includes(thinkingId));
  if (idx !== -1) {
    conv.messages[idx] = {role: 'bot', text: answer + imagesHtml};
    conv.updatedAt = Date.now();
    pcSaveConversations(pcConversations);
    renderPcChat();
  } else {
    pcPushMsg('bot', answer + imagesHtml);
  }
}

// ══ Barre de saisie du chat Analyse IA — même design que le chat Ami ══
// Icônes dupliquées localement (pas réutilisées depuis friends-chat.js) pour
// que cette barre reste fonctionnelle même si ce module optionnel n'est pas
// chargé (18/09/2026, demande de Paul).
const IA_ICON_MIC =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15z"/><path d="M18 11.5a1 1 0 0 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.92V19h-1.5a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2H13v-1.58a6 6 0 0 0 5-5.92z"/></svg>';
const IA_ICON_SEND =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M3.4 20.6l17.45-8.3a1 1 0 0 0 0-1.8L3.4 2.2a1 1 0 0 0-1.4 1.1l1.9 7L15 12 3.9 13.7l-1.9 7a1 1 0 0 0 1.4 1.1z"/></svg>';

function iaUpdateMicSendBtn() {
  const input = document.getElementById('pcQuestion');
  const btn = document.getElementById('iaMicBtn');
  if (!input || !btn) return;
  const hasText = input.value.trim().length > 0;
  btn.dataset.mode = hasText ? 'send' : 'mic';
  btn.innerHTML = hasText ? IA_ICON_SEND : IA_ICON_MIC;
}

// ── Partage d'une fiche de trade avec l'IA — même fiche que le chat Ami ──
// (fcBuildTradeCardHtml / fcCapBeforeAfterPct / fcCollectCustomFields dans
// friends-chat.js), avec repli si ce module n'est pas chargé.
function iaOpenTradePicker() {
  iaRenderTradePickerList('');
  const modal = document.getElementById('iaTradeModal');
  if (modal) modal.classList.add('open');
  const search = document.getElementById('iaTradeSearchInput');
  if (search) {
    search.value = '';
    search.focus();
  }
}
function iaCloseTradePicker() {
  const modal = document.getElementById('iaTradeModal');
  if (modal) modal.classList.remove('open');
}
function iaRenderTradePickerList(filter) {
  const list = document.getElementById('iaTradePickList');
  if (!list) return;
  const f = (filter || '').toLowerCase();
  const trades = (APP.trades || [])
    .filter(t => !f || (t.paire || '').toLowerCase().includes(f) || (t.date || '').includes(f))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id)
    .slice(0, 60);
  if (!trades.length) {
    list.innerHTML = '<div class="fc-empty-hint">Aucun trade trouvé.</div>';
    return;
  }
  list.innerHTML = trades
    .map(t => {
      const res = typeof t.res === 'number' ? t.res : parseFloat(t.res) || 0;
      const resColor =
        res >= 0 ? 'var(--fc-trade-pos-color,var(--green))' : 'var(--fc-trade-neg-color,var(--red))';
      return `<div class="fc-trade-pick-item" onclick="iaSendTradeMessage(${t.id})">
        <div class="fc-trade-pick-info">
          <div class="fc-trade-pick-pair">${escapeHtml(t.paire || '—')}${t.dir ? ' · ' + escapeHtml(t.dir) : ''}${t.backtest ? '&nbsp;<span class="fc-bt-badge">BT</span>' : ''}</div>
          <div class="fc-trade-pick-meta">${escapeHtml(t.date || '')}${t.heure ? ' ' + escapeHtml(t.heure) : ''}</div>
        </div>
        <div style="color:${resColor};font-family:var(--mono);font-size:12px;font-weight:700;flex-shrink:0;">${res >= 0 ? '+' : ''}${res.toFixed(2)}€</div>
      </div>`;
    })
    .join('');
}
function iaSendTradeMessage(tradeId) {
  const t = (APP.trades || []).find(x => x.id === tradeId);
  if (!t) return;
  const capInfo = typeof fcCapBeforeAfterPct === 'function' ? fcCapBeforeAfterPct(t) : null;
  const payload = {
    id: t.id,
    date: t.date || '',
    heure: t.heure || '',
    session: t.session || '',
    paire: t.paire || '',
    dir: t.dir || '',
    rrCible: t.rrCible || 0,
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
    customFields: typeof fcCollectCustomFields === 'function' ? fcCollectCustomFields(t) : [],
    images: Array.isArray(t.images) ? t.images.slice(0, 6) : []
  };
  // Les images de la fiche portent un onclick="openFullscreen(...)" inline, retiré par
  // pcSanitizeChatHtml (aucun attribut on* autorisé) : on les fait plutôt correspondre à
  // l'écouteur délégué déjà en place sur .pc-msg-img (cf. plus haut, pcImagesHtml).
  const cardHtml =
    typeof fcBuildTradeCardHtml === 'function'
      ? fcBuildTradeCardHtml(payload).replace(
          /<img src="([^"]*)" onclick="[^"]*">/g,
          '<img class="pc-msg-img" src="$1">'
        )
      : `Fiche partagée : ${escapeHtml(payload.paire || '—')} du ${escapeHtml(payload.date || '—')}`;
  const resTxt = (payload.res >= 0 ? '+' : '') + Number(payload.res).toFixed(2) + ' €';
  const plainSummary =
    `Fiche de trade partagée — ${payload.paire || '—'}${payload.dir ? ' ' + payload.dir : ''} du ${payload.date || '—'}, résultat ${resTxt}` +
    (payload.notes ? `. Notes : ${payload.notes}` : '');
  pcPushMsg('user', cardHtml, plainSummary);
  iaCloseTradePicker();
}

// ── Message vocal : contrairement au chat Ami, l'IA ne peut pas "écouter"
// un fichier audio. Le vocal est donc transcrit en direct (reconnaissance
// vocale du navigateur) puis envoyé comme une question classique, plutôt
// que joint tel quel. La visualisation de l'onde (getUserMedia +
// AnalyserNode) reste identique au chat Ami, purement visuelle (18/09/2026,
// demande de Paul). ──
const IA_WAVE_BAR_WIDTH = 3;
const IA_WAVE_BAR_GAP = 2;
let iaDragStartX = 0;
let iaDragArmed = false;
let iaDragMaxPx = -240;
let iaRecordStream = null;
let iaRecordStart = 0;
let iaRecordTimerHandle = null;
let iaAudioCtx = null;
let iaAnalyser = null;
let iaAnalyserData = null;
let iaWaveIntervalHandle = null;
let iaWaveSamples = [];
let iaRecognition = null;
let iaFinalTranscript = '';
let iaRecording = false;

function iaFmtDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function iaInitWaveBars() {
  const wave = document.getElementById('iaRecWave');
  if (!wave) return;
  const containerWidth = wave.getBoundingClientRect().width;
  let count = Math.floor((containerWidth + IA_WAVE_BAR_GAP) / (IA_WAVE_BAR_WIDTH + IA_WAVE_BAR_GAP));
  if (!count || count < 15) count = 15;
  wave.innerHTML = '';
  iaWaveSamples = new Array(count).fill(0);
  for (let i = 0; i < count; i++) {
    const bar = document.createElement('div');
    bar.className = 'ia-bar-wave-bar';
    wave.appendChild(bar);
  }
}
function iaSampleAndRenderWave() {
  if (!iaAnalyser || !iaAnalyserData) return;
  iaAnalyser.getByteTimeDomainData(iaAnalyserData);
  let maxDev = 0;
  for (let i = 0; i < iaAnalyserData.length; i++) {
    const dev = Math.abs(iaAnalyserData[i] - 128);
    if (dev > maxDev) maxDev = dev;
  }
  const vol = Math.min(1, Math.sqrt(maxDev / 12));
  iaWaveSamples.shift();
  iaWaveSamples.push(vol);
  const wave = document.getElementById('iaRecWave');
  if (!wave) return;
  const bars = wave.children;
  for (let i = 0; i < bars.length; i++) {
    bars[i].style.height = 15 + iaWaveSamples[i] * 85 + '%';
  }
}
function iaUpdateRecTimer() {
  const el = document.getElementById('iaRecTimer');
  if (el) el.textContent = iaFmtDuration((Date.now() - iaRecordStart) / 1000);
}
function iaShowRecordingUI(on) {
  const indicator = document.getElementById('iaRecIndicator');
  const input = document.getElementById('pcQuestion');
  const attachBtn = document.getElementById('iaAttachBtn');
  const cancelBtn = document.getElementById('iaCancelBtn');
  const micBtn = document.getElementById('iaMicBtn');
  const mobile = micHoldMode();
  if (indicator) indicator.style.display = on ? 'flex' : 'none';
  if (input) input.style.display = on ? 'none' : 'block';
  if (attachBtn) attachBtn.style.display = on ? 'none' : 'flex';
  if (cancelBtn) cancelBtn.style.display = on ? 'flex' : 'none';
  if (micBtn) {
    if (on && !mobile) {
      micBtn.dataset.mode = 'recording-send';
      micBtn.innerHTML = IA_ICON_SEND;
    } else if (!on) {
      iaUpdateMicSendBtn();
    }
  }
}
async function iaStartRecording() {
  if (iaRecording) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (typeof showSync === 'function') showSync('⚠ Micro non supporté', '#ef4444');
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (typeof showSync === 'function')
      showSync('⚠ Reconnaissance vocale non supportée par ce navigateur', '#ef4444');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    iaRecordStream = stream;
    iaRecording = true;
    iaRecordStart = Date.now();
    iaShowRecordingUI(true);
    iaRecordTimerHandle = setInterval(iaUpdateRecTimer, 200);
    try {
      iaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (iaAudioCtx.state === 'suspended') iaAudioCtx.resume().catch(() => {});
      const source = iaAudioCtx.createMediaStreamSource(stream);
      iaAnalyser = iaAudioCtx.createAnalyser();
      iaAnalyser.fftSize = 64;
      iaAnalyserData = new Uint8Array(iaAnalyser.fftSize);
      source.connect(iaAnalyser);
      iaInitWaveBars();
      iaWaveIntervalHandle = setInterval(iaSampleAndRenderWave, 33);
    } catch (e) {
      iaAnalyser = null; // pas grave : la transcription marche même sans le rendu visuel
    }
    iaFinalTranscript = '';
    iaRecognition = new SR();
    iaRecognition.lang = 'fr-FR';
    iaRecognition.continuous = true;
    iaRecognition.interimResults = true;
    iaRecognition.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) iaFinalTranscript += e.results[i][0].transcript;
      }
    };
    iaRecognition.onerror = e => console.warn('iaRecognition:', e.error);
    try {
      iaRecognition.start();
    } catch (e) {}
  } catch (e) {
    console.warn('getUserMedia error:', e && e.name, e && e.message);
    let msg = '⚠ Micro inaccessible';
    if (e && e.name === 'NotAllowedError') msg = '⚠ Autorise le micro dans les réglages du site';
    else if (e && e.name === 'NotFoundError') msg = '⚠ Aucun micro détecté sur cet appareil';
    else if (e && e.name === 'NotReadableError') msg = '⚠ Micro déjà utilisé par une autre appli';
    else if (e && e.name === 'SecurityError') msg = '⚠ Connexion non sécurisée (HTTPS requis)';
    if (typeof showSync === 'function') showSync(msg, '#ef4444');
    iaRecording = false;
  }
}
function iaStopRecording(shouldSend) {
  if (!iaRecording) return;
  iaRecording = false;
  clearInterval(iaRecordTimerHandle);
  clearInterval(iaWaveIntervalHandle);
  if (iaAudioCtx) {
    try {
      iaAudioCtx.close();
    } catch (e) {}
    iaAudioCtx = null;
  }
  iaAnalyser = null;
  iaAnalyserData = null;
  if (iaRecordStream) {
    iaRecordStream.getTracks().forEach(t => t.stop());
    iaRecordStream = null;
  }
  iaShowRecordingUI(false);
  const rec = iaRecognition;
  iaRecognition = null;
  if (!rec) return;
  rec.onend = () => {
    const transcript = iaFinalTranscript.trim();
    iaFinalTranscript = '';
    if (shouldSend && transcript) {
      const input = document.getElementById('pcQuestion');
      if (input) input.value = transcript;
      sendPcMessage();
    }
  };
  try {
    rec.stop();
  } catch (e) {
    iaFinalTranscript = '';
  }
}
// ── Téléphone : glisser le micro vers la gauche pour annuler (comme le chat Ami) ──
function iaOnMicPointerDown(e) {
  const micBtn = document.getElementById('iaMicBtn');
  if (!micBtn || !micHoldMode() || micBtn.dataset.mode !== 'mic') return;
  e.preventDefault();
  iaDragStartX = e.clientX;
  iaDragArmed = false;
  const bar = document.getElementById('iaBarRow');
  const micRect = micBtn.getBoundingClientRect();
  if (bar) {
    const barRect = bar.getBoundingClientRect();
    iaDragMaxPx = -(micRect.left - barRect.left - 26);
    if (iaDragMaxPx > -90) iaDragMaxPx = -90;
  } else {
    iaDragMaxPx = -240;
  }
  try {
    micBtn.setPointerCapture(e.pointerId);
  } catch (err) {}
  micBtn.style.transition = 'none';
  iaStartRecording();
}
function iaOnMicPointerMove(e) {
  if (!micHoldMode() || !iaRecording) return;
  const micBtn = document.getElementById('iaMicBtn');
  if (!micBtn) return;
  let dx = Math.min(0, e.clientX - iaDragStartX);
  dx = Math.max(dx, iaDragMaxPx);
  micBtn.style.transform = 'translateX(' + dx + 'px)';
  const armed = dx <= iaDragMaxPx * 0.92;
  if (armed !== iaDragArmed) {
    iaDragArmed = armed;
    const cancelBtn = document.getElementById('iaCancelBtn');
    if (cancelBtn) cancelBtn.classList.toggle('armed', armed);
  }
}
function iaOnMicPointerUp() {
  if (!micHoldMode()) return;
  const micBtn = document.getElementById('iaMicBtn');
  if (micBtn) {
    micBtn.style.transition = '';
    micBtn.style.transform = '';
  }
  const cancelBtn = document.getElementById('iaCancelBtn');
  if (cancelBtn) cancelBtn.classList.remove('armed');
  if (micBtn && micBtn.dataset.mode === 'mic' && iaRecording) {
    iaStopRecording(!iaDragArmed);
  }
  iaDragArmed = false;
}
// ── PC : clic pour démarrer, clic sur l'avion pour envoyer, corbeille pour annuler ──
function iaOnMicClick() {
  const micBtn = document.getElementById('iaMicBtn');
  if (!micBtn) return;
  const mode = micBtn.dataset.mode;
  if (mode === 'send') {
    sendPcMessage();
  } else if (mode === 'recording-send') {
    iaStopRecording(true);
  } else if (mode === 'mic' && !micHoldMode()) {
    iaStartRecording();
  }
}
function iaBindComposerEvents() {
  const input = document.getElementById('pcQuestion');
  const micBtn = document.getElementById('iaMicBtn');
  const attachBtn = document.getElementById('iaAttachBtn');
  const cancelBtn = document.getElementById('iaCancelBtn');
  if (input) {
    input.addEventListener('input', () => {
      if (typeof autoGrow === 'function') autoGrow(input);
      iaUpdateMicSendBtn();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPcMessage();
      }
    });
  }
  if (attachBtn) attachBtn.addEventListener('click', iaOpenTradePicker);
  if (cancelBtn) cancelBtn.addEventListener('click', () => iaStopRecording(false));
  if (micBtn) {
    micBtn.addEventListener('click', iaOnMicClick);
    micBtn.addEventListener('pointerdown', iaOnMicPointerDown);
    micBtn.addEventListener('pointermove', iaOnMicPointerMove);
    ['pointerup', 'pointercancel'].forEach(evt => micBtn.addEventListener(evt, iaOnMicPointerUp));
  }
  iaUpdateMicSendBtn();
}
iaBindComposerEvents();

// Échappement HTML générique, sûr aussi bien dans un nœud texte que dans un
// attribut entre guillemets. Les guillemets doubles/simples ont été ajoutés :
// sans eux, une valeur du type `x" onerror="..."` pouvait sortir de l'attribut
// dans les nombreux endroits du code qui interpolent escapeHtml(...) à
// l'intérieur de src="...", value="...", data-v="..." etc.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Détecte le mode téléphone (même seuil que les media queries CSS)
function isMobileView() {
  return window.innerWidth <= 1100;
}
// Micro des chats (IA et Amis) : le mode « rester appuyé pour parler, glisser
// pour annuler » ne concerne QUE le mode d'affichage Téléphone. Dans tous les
// modes PC (normal, ultra wide, vertical) — même si la fenêtre fait moins de
// 1100 px de large, ce que isMobileView() prend pour un téléphone — on clique
// une fois pour démarrer, puis sur l'avion pour envoyer ou la corbeille pour
// annuler, sans rien maintenir appuyé.
function micHoldMode() {
  return typeof cfIsMobile === 'function' ? cfIsMobile() : isMobileView();
}
// Retire les émojis décoratifs d'un texte si on est en mode téléphone (laisse les symboles fonctionnels intacts)
function stripDecoEmoji(s) {
  if (!isMobileView() || typeof s !== 'string') return s;
  return s
    .replace(/[📷💾🗑📈📊📉⭐📋📝💰🎯💸🔢🤔✅⚠️⚠]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Helper de statistiques par clé (paire, session, tf, conf...)
function pcStat(arr, key) {
  const m = {};
  arr.forEach(t => {
    const vals = t[key] ? (key === 'tf' || key === 'conf' ? t[key].split(/[|,]/) : [t[key]]) : [];
    vals.forEach(v => {
      v = v.trim();
      if (!v) return;
      if (!m[v]) m[v] = {pnl: 0, n: 0, w: 0};
      m[v].pnl += t.res || 0;
      m[v].n++;
      if ((t.res || 0) > 0) m[v].w++;
    });
  });
  return Object.entries(m).sort((a, b) => b[1].pnl - a[1].pnl);
}

// Génère un résumé global combinant performance, RR, notes et images
function pcGlobalSummary(trades) {
  const total = trades.length;
  const winners = trades.filter(t => (t.res || 0) > 0);
  const losers = trades.filter(t => (t.res || 0) < 0);
  const totalPnl = trades.reduce((s, t) => s + (t.res || 0), 0);
  const wr = total > 0 ? ((winners.length / total) * 100).toFixed(1) : 0;
  const gw = winners.reduce((s, t) => s + t.res, 0);
  const gl = Math.abs(losers.reduce((s, t) => s + t.res, 0));
  const pf = gl > 0 ? (gw / gl).toFixed(2) : '∞';

  const byPaire = pcStat(trades, 'paire');
  const bySess = pcStat(trades, 'session');
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const byDay = pcStat(
    trades.map(t => ({...t, day: t.date ? jours[new Date(t.date).getDay()] : '?'})),
    'day'
  );

  // Drawdown
  const cap = CAPITAL();
  let peak = cap,
    runCap = cap,
    maxDD = 0;
  [...trades]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(t => {
      runCap += t.res || 0;
      if (runCap > peak) peak = runCap;
      const dd = ((peak - runCap) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    });

  // RR
  const rrArr = trades.map(t => computeRR(t));
  const rrMoy = rrArr.length ? (rrArr.reduce((a, b) => a + b, 0) / rrArr.length).toFixed(2) : null;

  // Notes
  const withNotes = trades.filter(t => t.notes && t.notes.trim());
  const stop = new Set([
    'les',
    'des',
    'que',
    'qui',
    'pour',
    'dans',
    'avec',
    'sur',
    'une',
    "j'ai",
    'j’ai',
    'mais',
    'plus',
    'pas',
    'est',
    'été',
    'etais',
    'était',
    'trade',
    'trop',
    'bien',
    'fait',
    "j'avais"
  ]);
  const freq = {};
  withNotes.forEach(t => {
    t.notes
      .toLowerCase()
      .split(/[^a-zà-ÿ']+/)
      .forEach(w => {
        if (w.length < 4 || stop.has(w)) return;
        freq[w] = (freq[w] || 0) + 1;
      });
  });
  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= 2)
    .slice(0, 4)
    .map(([w]) => w);

  // Images
  const withImg = trades.filter(t => t.images && t.images.length);

  // ── Construction du résumé ──
  let r = `<strong>📊 Résumé global — ${total} trades</strong><br>`;
  r += `Win rate : <strong>${wr}%</strong> • P&L total : <strong>${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}€</strong> • Profit factor : <strong>${pf}</strong> • Drawdown max : <strong>${maxDD.toFixed(1)}%</strong><br>`;
  if (rrMoy !== null)
    r += `RR réalisé moyen : <strong>${rrMoy}R</strong> sur ${rrArr.length} trade(s).<br>`;
  r += '<br>';

  if (byPaire.length) {
    r += `Meilleure paire : <strong>${byPaire[0][0]}</strong> (${byPaire[0][1].pnl >= 0 ? '+' : ''}${byPaire[0][1].pnl.toFixed(0)}€)`;
    if (byPaire.length > 1 && byPaire[byPaire.length - 1][1].pnl < 0)
      r += `, pire paire : <strong>${byPaire[byPaire.length - 1][0]}</strong> (${byPaire[byPaire.length - 1][1].pnl.toFixed(0)}€)`;
    r += '.<br>';
  }
  if (bySess.length)
    r += `Meilleure session : <strong>${bySess[0][0]}</strong> (${bySess[0][1].pnl >= 0 ? '+' : ''}${bySess[0][1].pnl.toFixed(0)}€).<br>`;
  if (byDay.length) {
    const bestDay = byDay[0],
      worstDay = [...byDay].sort((a, b) => a[1].pnl - b[1].pnl)[0];
    r += `Meilleur jour : <strong>${bestDay[0]}</strong> (${bestDay[1].pnl >= 0 ? '+' : ''}${bestDay[1].pnl.toFixed(0)}€)`;
    if (worstDay && worstDay[1].pnl < 0)
      r += `, pire jour : <strong>${worstDay[0]}</strong> (${worstDay[1].pnl.toFixed(0)}€)`;
    r += '.<br>';
  }
  r += '<br>';

  // Notes
  if (withNotes.length) {
    r += `📝 ${withNotes.length}/${total} trades commentés`;
    if (topWords.length) r += ` — thèmes récurrents : ${topWords.join(', ')}`;
    r += '.<br>';
  } else {
    r += `📝 Aucune note rédigée pour le moment — commenter tes trades aiderait l'analyse.<br>`;
  }

  // Images
  if (withImg.length) {
    const winWithImg = withImg.filter(t => (t.res || 0) > 0).length;
    r += `📷 ${withImg.length}/${total} trades avec capture(s) — ${((winWithImg / withImg.length) * 100).toFixed(0)}% de ces trades documentés sont gagnants.<br>`;
  } else {
    r += `📷 Aucune capture d'écran ajoutée aux trades.<br>`;
  }

  r += '<br><strong>Action prioritaire :</strong> ';
  r +=
    parseFloat(wr) < 50
      ? `améliorer la sélection des entrées (win rate sous 50%).`
      : parseFloat(pf) < 1.2
        ? `couper les pertes plus tôt pour améliorer le profit factor.`
        : maxDD > 15
          ? `mettre en place un stop journalier, le drawdown max est élevé.`
          : `continuer sur cette voie, la stratégie est globalement solide.`;

  return stripDecoEmoji(r);
}

// Moteur d'analyse local : interprète la question et répond
function pcAnalyze(q) {
  const trades = APP.trades || [];
  if (!trades.length) {
    return 'Ton journal est vide pour le moment — ajoute des trades pour que je puisse les analyser.';
  }

  // Normalisation : minuscules + accents retirés (tolère fautes/accents/variantes)
  const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const qNorm = stripAccents(q.toLowerCase());
  const qLower = qNorm; // alias conservé pour compatibilité

  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  const total = trades.length;
  const winners = trades.filter(t => (t.res || 0) > 0);
  const losers = trades.filter(t => (t.res || 0) < 0);
  const totalPnl = trades.reduce((s, t) => s + (t.res || 0), 0);
  const wr = total > 0 ? ((winners.length / total) * 100).toFixed(1) : 0;
  const gw = winners.reduce((s, t) => s + t.res, 0);
  const gl = Math.abs(losers.reduce((s, t) => s + t.res, 0));
  const pf = gl > 0 ? (gw / gl).toFixed(2) : '∞';

  const byPaire = pcStat(trades, 'paire');
  const bySess = pcStat(trades, 'session');
  const byTF = pcStat(trades, 'tf');
  const byConf = pcStat(trades, 'conf');
  const byDay = pcStat(
    trades.map(t => ({...t, day: t.date ? jours[new Date(t.date).getDay()] : '?'})),
    'day'
  );

  // ── Salutations courtes (réponse immédiate, pas de scoring) ──
  if (/^(salut|bonjour|bonsoir|hey|hello|coucou|yo|cc)\b/.test(qNorm) && qNorm.length < 15) {
    return `Salut ! Pose-moi n'importe quelle question sur ton journal : performance, points forts/faibles, jours, paires, sessions, RR, notes, images... Ou demande un "résumé" pour une synthèse complète.`;
  }

  // ── Détection dynamique : un jour de la semaine est mentionné ──
  const dayIdx = jours.findIndex(j => qNorm.includes(stripAccents(j)));
  if (dayIdx !== -1) {
    const dayTrades = trades.filter(
      t => t.date && jours[new Date(t.date).getDay()] === jours[dayIdx]
    );
    if (!dayTrades.length) return `Aucun trade enregistré le ${jours[dayIdx]}.`;
    const pBy = pcStat(dayTrades, 'paire');
    const pnl = dayTrades.reduce((s, t) => s + (t.res || 0), 0);
    const dwr = ((dayTrades.filter(t => (t.res || 0) > 0).length / dayTrades.length) * 100).toFixed(
      0
    );
    let r = `<strong>${jours[dayIdx].charAt(0).toUpperCase() + jours[dayIdx].slice(1)}</strong> : ${dayTrades.length} trade(s), P&L total ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}€, win rate ${dwr}%.`;
    if (pBy.length)
      r += `<br>Meilleure paire ce jour-là : ${pBy[0][0]} (${pBy[0][1].pnl >= 0 ? '+' : ''}${pBy[0][1].pnl.toFixed(0)}€).`;
    return r;
  }

  // ── Détection dynamique : une paire spécifique du journal est mentionnée ──
  for (const [paire, d] of byPaire) {
    const pNorm = stripAccents(paire.toLowerCase());
    if (pNorm.length >= 3 && qNorm.includes(pNorm)) {
      const pTrades = trades.filter(t => (t.paire || '') === paire);
      const dwr = ((d.w / d.n) * 100).toFixed(0);
      let r = `<strong>${paire}</strong> : ${d.n} trade(s), P&L ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}€, win rate ${dwr}%.`;
      const noted = pTrades.filter(t => t.notes && t.notes.trim());
      if (noted.length) r += `<br>${noted.length} trade(s) commenté(s) sur cette paire.`;
      return r;
    }
  }

  // ── Détection dynamique : une confluence spécifique est mentionnée ──
  for (const [conf, d] of byConf) {
    const cNorm = stripAccents(conf.toLowerCase());
    if (cNorm.length >= 3 && qNorm.includes(cNorm)) {
      return `Confluence <strong>"${conf}"</strong> : ${d.n} trade(s), P&L ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}€, win rate ${((d.w / d.n) * 100).toFixed(0)}%.`;
    }
  }

  // ── Détection dynamique : une session spécifique est mentionnée ──
  for (const [sess, d] of bySess) {
    const sNorm = stripAccents(sess.toLowerCase());
    if (sNorm.length >= 3 && qNorm.includes(sNorm)) {
      return `Session <strong>${sess}</strong> : ${d.n} trade(s), P&L ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}€, win rate ${((d.w / d.n) * 100).toFixed(0)}%.`;
    }
  }

  // ── Table d'intentions : chaque intention a une liste de mots/expressions déclencheurs (sans accents) ──
  const intents = [
    {
      name: 'resume',
      kws: [
        'resume',
        'synthese',
        'bilan',
        'vue d ensemble',
        'vue globale',
        'tout savoir',
        'dis moi tout',
        'recap',
        'recapitulatif',
        'analyse mes trades',
        'analyse ma strategie',
        'analyse mon journal',
        'analyse complete',
        'comment je vais',
        'comment ca va',
        'ou j en suis',
        "ou j'en suis"
      ]
    },
    {name: 'rr', kws: ['rr', 'risk reward', 'risque rendement', 'ratio risque', 'r/r', 'ratio rr']},
    {
      name: 'notes',
      kws: [
        'note',
        'notes',
        'commentaire',
        'commentaires',
        'remarque',
        'remarques',
        'j ecris',
        'ce que j ecris',
        'ce que je note',
        'mes ecrits',
        'journal de bord',
        'mes pensees',
        'mes reflexions'
      ]
    },
    {
      name: 'images',
      kws: [
        'image',
        'images',
        'screenshot',
        'screenshots',
        'capture',
        'captures',
        'photo',
        'photos',
        'graphique de trade',
        'chart',
        'visuel'
      ]
    },
    {
      name: 'gestion',
      kws: [
        'gestion',
        'mgmt',
        'management',
        'reprise',
        'reprises',
        'reprendre',
        'repris',
        'gere mes trades'
      ]
    },
    {
      name: 'pointsforts',
      kws: [
        'point fort',
        'points fort',
        'points forts',
        'mes forces',
        'ma force',
        'ce qui marche',
        'ce qui fonctionne',
        'ce que je fais bien',
        'mes qualites',
        'mes atouts'
      ]
    },
    {
      name: 'pointsfaibles',
      kws: [
        'point faible',
        'points faible',
        'points faibles',
        'mes faiblesses',
        'ma faiblesse',
        'ce qui ne marche pas',
        'ce qui ne fonctionne pas',
        'a ameliorer',
        'a corriger',
        'mes erreurs',
        'mes defauts',
        'ce que je fais mal',
        'points a travailler'
      ]
    },
    {
      name: 'meilleurjour',
      kws: [
        'meilleur jour',
        'jour le plus performant',
        'jour suis je le plus',
        'quel jour',
        'mon meilleur jour',
        'jour ou je gagne',
        'jour ou je suis le plus rentable'
      ]
    },
    {
      name: 'pirejour',
      kws: [
        'pire jour',
        'moins bon jour',
        'jour a eviter',
        'jour le moins performant',
        'jour ou je perds',
        'plus mauvais jour'
      ]
    },
    {
      name: 'meilleurepaire',
      kws: [
        'meilleure paire',
        'meilleur pair',
        'paire la plus rentable',
        'paire qui marche le mieux',
        'sur quelle paire je suis le meilleur',
        'quelle paire me reussit'
      ]
    },
    {
      name: 'pirepaire',
      kws: [
        'pire paire',
        'moins bonne paire',
        'paire a eviter',
        'pire pair',
        'quelle paire eviter',
        'paire deficitaire'
      ]
    },
    {
      name: 'session',
      kws: [
        'session',
        'sessions',
        'quelle session',
        'quel moment de la journee',
        'horaire de trading'
      ]
    },
    {
      name: 'timeframe',
      kws: [
        'timeframe',
        'time frame',
        'unite de temps',
        'quel tf',
        'tf le plus',
        'quel graphique',
        'quelle unite'
      ]
    },
    {
      name: 'confluence',
      kws: [
        'confluence',
        'confluences',
        'setup',
        'strategie qui marche',
        'quelle strategie',
        'quel setup'
      ]
    },
    {
      name: 'winrate',
      kws: [
        'win rate',
        'winrate',
        'taux de reussite',
        'taux de victoire',
        'pourcentage de gain',
        'pourcentage de reussite',
        'ratio de victoire',
        'combien je gagne en pourcentage'
      ]
    },
    {name: 'profitfactor', kws: ['profit factor', 'profitfactor', 'facteur de profit']},
    {
      name: 'pnl',
      kws: [
        'pnl',
        'p&l',
        'p l',
        'resultat total',
        'gain total',
        'perte totale',
        'combien j ai gagne',
        'combien j ai perdu',
        'solde',
        'performance globale',
        'combien je suis',
        'suis je en profit',
        'suis je en perte',
        'suis je rentable'
      ]
    }
  ];

  // Score chaque intention : +2 si une phrase complète matche, +1 par mot isolé présent
  let bestIntent = null,
    bestScore = 0;
  for (const intent of intents) {
    let score = 0;
    for (const kw of intent.kws) {
      if (qNorm.includes(kw)) {
        score += kw.includes(' ') ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent.name;
    }
  }

  switch (bestIntent) {
    case 'resume':
      return pcGlobalSummary(trades);

    case 'rr': {
      const withRR = trades.filter(t => t.rrCible > 0);
      if (!withRR.length) return `Aucun RR cible renseigné dans le journal.`;
      const rrReal = withRR.map(t => computeRR(t));
      const rrMoy = (rrReal.reduce((a, b) => a + b, 0) / rrReal.length).toFixed(2);
      const rrCibleMoy = (withRR.reduce((s, t) => s + (t.rrCible || 0), 0) / withRR.length).toFixed(
        2
      );
      const atteint = withRR.filter(t => computeRR(t) >= (t.rrCible || 0)).length;
      let r = `RR cible moyen : <strong>${rrCibleMoy}R</strong> • RR réalisé moyen : <strong>${rrMoy}R</strong>.<br>`;
      r += `Objectif atteint ou dépassé sur ${atteint}/${withRR.length} trades (${((atteint / withRR.length) * 100).toFixed(0)}%).`;
      return r;
    }

    case 'notes': {
      const withNotes = trades.filter(t => t.notes && t.notes.trim());
      if (!withNotes.length) return `Aucune note rédigée dans tes trades pour le moment.`;
      const stop = new Set([
        'les',
        'des',
        'que',
        'qui',
        'pour',
        'dans',
        'avec',
        'sur',
        'une',
        'j ai',
        'mais',
        'plus',
        'pas',
        'est',
        'ete',
        'etais',
        'etait',
        'trade',
        'trop',
        'bien',
        'fait'
      ]);
      const freq = {};
      withNotes.forEach(t => {
        stripAccents(t.notes.toLowerCase())
          .split(/[^a-z']+/)
          .forEach(w => {
            if (w.length < 4 || stop.has(w)) return;
            freq[w] = (freq[w] || 0) + 1;
          });
      });
      const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .filter(([, n]) => n >= 2)
        .slice(0, 5)
        .map(([w]) => w);
      const winNotes = withNotes.filter(t => (t.res || 0) > 0).length;
      const loseNotes = withNotes.filter(t => (t.res || 0) < 0).length;
      let r = `${withNotes.length} trade(s) avec une note sur ${total} (${winNotes} gagnants, ${loseNotes} perdants).<br>`;
      if (topWords.length)
        r += `Mots/thèmes qui reviennent souvent dans tes notes : ${topWords.join(', ')}.<br>`;
      const lastNoted = [...withNotes].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      )[0];
      if (lastNoted)
        r += `Dernière note (${lastNoted.date || '?'}, ${lastNoted.paire || ''}) : "${lastNoted.notes.slice(0, 140)}${lastNoted.notes.length > 140 ? '…' : ''}"`;
      return r;
    }

    case 'images': {
      const withImg = trades.filter(t => t.images && t.images.length);
      if (!withImg.length) return `Aucun trade n'a de capture d'écran associée.`;
      const totalImg = withImg.reduce((s, t) => s + t.images.length, 0);
      const winWithImg = withImg.filter(t => (t.res || 0) > 0).length;
      return `${withImg.length} trade(s) sur ${total} ont au moins une capture (${totalImg} image(s) au total). Parmi eux, ${winWithImg} sont gagnants (${((winWithImg / withImg.length) * 100).toFixed(0)}%). Pense à documenter aussi tes trades perdants pour mieux repérer les erreurs visuelles récurrentes.`;
    }

    case 'gestion': {
      const byMgmt = pcStat(trades, 'mgmt');
      const byReprend = pcStat(trades, 'reprend');
      let r = '';
      if (byMgmt.length) {
        r += `Gestion de trade la plus rentable : <strong>${byMgmt[0][0]}</strong> (${byMgmt[0][1].pnl >= 0 ? '+' : ''}${byMgmt[0][1].pnl.toFixed(0)}€, ${((byMgmt[0][1].w / byMgmt[0][1].n) * 100).toFixed(0)}% WR).<br>`;
      }
      if (byReprend.length) {
        const totPnl = byReprend.reduce((s, [, d]) => s + d.pnl, 0);
        const totN = byReprend.reduce((s, [, d]) => s + d.n, 0);
        r += `Sur les trades repris (${totN} au total), le résultat global est ${totPnl >= 0 ? '+' : ''}${totPnl.toFixed(0)}€.`;
      }
      return r || `Pas assez de données de gestion/reprise renseignées dans le journal.`;
    }

    case 'pointsforts': {
      const pts = [];
      if (parseFloat(wr) >= 50) pts.push(`Win rate solide de ${wr}% sur ${total} trades`);
      if (parseFloat(pf) >= 1.2) pts.push(`Profit factor de ${pf}, tes gains dépassent tes pertes`);
      if (totalPnl > 0)
        pts.push(`Compte en hausse de ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}€`);
      byPaire
        .filter(([, d]) => d.pnl > 0)
        .slice(0, 2)
        .forEach(([p, d]) =>
          pts.push(
            `${p} est rentable : ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(0)}€ sur ${d.n} trades (${((d.w / d.n) * 100).toFixed(0)}% WR)`
          )
        );
      bySess
        .filter(([, d]) => d.pnl > 0)
        .slice(0, 1)
        .forEach(([s, d]) =>
          pts.push(`La session ${s} te réussit bien (${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(0)}€)`)
        );
      byConf
        .filter(([, d]) => d.pnl > 0 && d.n >= 2)
        .slice(0, 2)
        .forEach(([c, d]) =>
          pts.push(
            `La confluence "${c}" fonctionne (${((d.w / d.n) * 100).toFixed(0)}% WR sur ${d.n} trades)`
          )
        );
      if (!pts.length)
        return `Je n'ai pas encore identifié de point fort net — continue à logger tes trades pour affiner l'analyse.`;
      return `<strong>Tes points forts :</strong><br>• ${pts.slice(0, 5).join('<br>• ')}`;
    }

    case 'pointsfaibles': {
      const pts = [];
      if (parseFloat(wr) < 50) pts.push(`Win rate de ${wr}%, sous la barre des 50%`);
      if (parseFloat(pf) < 1) pts.push(`Profit factor de ${pf} : tes pertes dépassent tes gains`);
      if (totalPnl < 0) pts.push(`Compte en baisse de ${totalPnl.toFixed(2)}€`);
      byPaire
        .filter(([, d]) => d.pnl < 0)
        .slice(0, 2)
        .forEach(([p, d]) =>
          pts.push(
            `${p} est déficitaire : ${d.pnl.toFixed(0)}€ sur ${d.n} trades (${((d.w / d.n) * 100).toFixed(0)}% WR)`
          )
        );
      byTF
        .filter(([, d]) => d.pnl < 0)
        .slice(0, 2)
        .forEach(([tf, d]) => pts.push(`Le timeframe ${tf} te coûte ${d.pnl.toFixed(0)}€`));
      const worstDays = [...byDay]
        .sort((a, b) => a[1].pnl - b[1].pnl)
        .filter(([, d]) => d.pnl < 0)
        .slice(0, 2);
      worstDays.forEach(([day, d]) =>
        pts.push(`Le ${day} est ton jour le moins bon (${d.pnl.toFixed(0)}€)`)
      );
      byConf
        .filter(([, d]) => d.pnl < 0 && d.n >= 2)
        .slice(0, 2)
        .forEach(([c, d]) =>
          pts.push(`La confluence "${c}" ne fonctionne pas bien (${d.pnl.toFixed(0)}€)`)
        );
      if (!pts.length) return `Rien de problématique détecté pour le moment, continue comme ça !`;
      return `<strong>Tes points à améliorer :</strong><br>• ${pts.slice(0, 5).join('<br>• ')}`;
    }

    case 'meilleurjour': {
      if (!byDay.length) return `Pas assez de données pour déterminer ton meilleur jour.`;
      const best = byDay[0];
      let r = `Ton meilleur jour est <strong>${best[0]}</strong> avec ${best[1].pnl >= 0 ? '+' : ''}${best[1].pnl.toFixed(2)}€ sur ${best[1].n} trade(s), soit ${((best[1].w / best[1].n) * 100).toFixed(0)}% de win rate.`;
      const worst = [...byDay].sort((a, b) => a[1].pnl - b[1].pnl)[0];
      if (worst && worst[0] !== best[0]) {
        r += `<br>Ton jour le moins bon est <strong>${worst[0]}</strong> (${worst[1].pnl >= 0 ? '+' : ''}${worst[1].pnl.toFixed(2)}€).`;
      }
      return r;
    }

    case 'pirejour': {
      if (!byDay.length) return `Pas assez de données pour déterminer ton pire jour.`;
      const worst = [...byDay].sort((a, b) => a[1].pnl - b[1].pnl)[0];
      return `Ton jour le moins performant est <strong>${worst[0]}</strong> avec ${worst[1].pnl >= 0 ? '+' : ''}${worst[1].pnl.toFixed(2)}€ sur ${worst[1].n} trade(s), soit ${((worst[1].w / worst[1].n) * 100).toFixed(0)}% de win rate.`;
    }

    case 'meilleurepaire': {
      if (!byPaire.length) return 'Aucune paire renseignée dans le journal.';
      const [p, d] = byPaire[0];
      return `Ta meilleure paire est <strong>${p}</strong> avec ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}€ sur ${d.n} trade(s), soit ${((d.w / d.n) * 100).toFixed(0)}% de win rate.`;
    }

    case 'pirepaire': {
      if (!byPaire.length) return 'Aucune paire renseignée dans le journal.';
      const [p, d] = byPaire[byPaire.length - 1];
      return `Ta paire la moins performante est <strong>${p}</strong> avec ${d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}€ sur ${d.n} trade(s), soit ${((d.w / d.n) * 100).toFixed(0)}% de win rate.`;
    }

    case 'session': {
      if (!bySess.length) return 'Aucune session renseignée dans le journal.';
      const best = bySess[0];
      const worst = bySess[bySess.length - 1];
      let r = `Meilleure session : <strong>${best[0]}</strong> (${best[1].pnl >= 0 ? '+' : ''}${best[1].pnl.toFixed(2)}€, ${((best[1].w / best[1].n) * 100).toFixed(0)}% WR).`;
      if (bySess.length > 1)
        r += `<br>Session la moins bonne : <strong>${worst[0]}</strong> (${worst[1].pnl >= 0 ? '+' : ''}${worst[1].pnl.toFixed(2)}€).`;
      return r;
    }

    case 'timeframe': {
      if (!byTF.length) return 'Aucun timeframe renseigné dans le journal.';
      const best = byTF[0];
      let r = `Meilleur timeframe : <strong>${best[0]}</strong> (${best[1].pnl >= 0 ? '+' : ''}${best[1].pnl.toFixed(2)}€, ${((best[1].w / best[1].n) * 100).toFixed(0)}% WR sur ${best[1].n} trades).`;
      const worst = byTF[byTF.length - 1];
      if (byTF.length > 1 && worst[1].pnl < 0)
        r += `<br>À éviter : <strong>${worst[0]}</strong> (${worst[1].pnl.toFixed(2)}€).`;
      return r;
    }

    case 'confluence': {
      if (!byConf.length) return 'Aucune confluence renseignée dans le journal.';
      const best = byConf[0];
      return `Confluence la plus rentable : <strong>"${best[0]}"</strong> (${best[1].pnl >= 0 ? '+' : ''}${best[1].pnl.toFixed(2)}€, ${((best[1].w / best[1].n) * 100).toFixed(0)}% WR sur ${best[1].n} trades).`;
    }

    case 'winrate':
      return `Ton win rate global est de <strong>${wr}%</strong> sur ${total} trades.`;

    case 'profitfactor':
      return `Ton profit factor est de <strong>${pf}</strong> (gains bruts : ${gw.toFixed(2)}€, pertes brutes : ${gl.toFixed(2)}€).`;

    case 'pnl':
      return `Ton P&L total est de <strong>${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}€</strong> sur ${total} trades.`;
  }

  // ── Fallback intelligent : aucune intention claire détectée, on donne un mini-résumé utile ──
  return (
    `Je ne suis pas sûr de bien cerner ta question, voici un aperçu rapide en attendant :<br><br>` +
    pcGlobalSummary(trades)
  );
}
