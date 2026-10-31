// ═══════════════════════════════════════════════════════════════════════
// LIAISON TJP → CASHFLOW TRACKER — module additif
// ═══════════════════════════════════════════════════════════════════════
// Permet à un utilisateur de TJP d'autoriser l'app « Cashflow Tracker » à recevoir le PnL
// (montant + date de chaque trade, HORS backtest) des sous-comptes qu'il coche. RIEN d'autre n'est partagé.
//
// Déroulé :
//   1. Cashflow Tracker redirige vers  https://plutonicame.github.io/TradingJournalPro/?cashflow_link=1&return=<URL>&state=<valeur>
//   2. L'utilisateur se connecte à TJP normalement (Google + PIN) — c'est la preuve que c'est bien son compte.
//   3. Cet écran liste SES sous-comptes ; il coche, puis « Autoriser ».
//   4. L'Edge Function `cashflow-link` crée un jeton de liaison (stocké seulement sous forme d'empreinte).
//   5. Retour vers <URL>#tjp_token=...&state=...&accounts=... (le jeton est dans le fragment : il n'est jamais envoyé à un serveur).
//   6. Cashflow Tracker appelle ensuite l'Edge Function `cashflow-pnl` avec ce jeton.
// La liaison se révoque depuis Paramètres → « APPLICATIONS LIÉES ».

(function () {
  'use strict';

  // ► Origines autorisées à recevoir le jeton (sécurité anti-vol de jeton : on ne redirige JAMAIS ailleurs).
  //   Ajouter ici l'adresse (origine = https://nom.github.io, SANS chemin) de Cashflow Tracker.
  var CF_ALLOWED_ORIGINS = [
    'https://maxenceguilloteau7-cpu.github.io' // Cashflow Tracker
  ];

  var LS_REQ = 'tjp_cf_req';
  var REQ_TTL = 20 * 60 * 1000; // la demande reste valable 20 min (le temps de se connecter)
  var FN_LINK = window.SUPABASE_URL + '/functions/v1/cashflow-link';

  function esc(s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
        });
  }
  function originAllowed(u) {
    try {
      var o = new URL(u);
      if (o.protocol === 'http:' && (o.hostname === 'localhost' || o.hostname === '127.0.0.1')) return true;
      return o.protocol === 'https:' && CF_ALLOWED_ORIGINS.indexOf(o.origin) !== -1;
    } catch (e) {
      return false;
    }
  }
  function readReq() {
    try {
      var r = JSON.parse(localStorage.getItem(LS_REQ) || 'null');
      if (r && Date.now() - r.t < REQ_TTL) return r;
    } catch (e) {}
    localStorage.removeItem(LS_REQ);
    return null;
  }

  // ── 1. Lecture de la demande dans l'URL (avant la connexion : la page est rechargée par Google) ──
  (function captureRequest() {
    var p = new URLSearchParams(location.search);
    if (p.get('cashflow_link') !== '1') return;
    var ret = p.get('return') || '';
    var state = (p.get('state') || '').slice(0, 200);
    var label = (p.get('label') || 'Cashflow Tracker').slice(0, 60);
    try {
      localStorage.setItem(LS_REQ, JSON.stringify({ret: ret, state: state, label: label, t: Date.now()}));
    } catch (e) {}
    history.replaceState(null, '', location.pathname + location.hash);
  })();

  // ── 2. Écran « Autoriser » ──
  function backTo(req, params) {
    var u = new URL(req.ret);
    var h = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      h.set(k, params[k]);
    });
    if (req.state) h.set('state', req.state);
    u.hash = h.toString();
    localStorage.removeItem(LS_REQ);
    location.href = u.toString();
  }
  function closeModal() {
    var m = document.getElementById('cfLinkModal');
    if (m) m.remove();
  }
  async function showAuthorize(req, preview) {
    closeModal();
    var m = document.createElement('div');
    m.className = 'confirm-modal open';
    m.id = 'cfLinkModal';
    m.style.zIndex = 5000;
    var box = '<div class="confirm-box" style="width:360px;text-align:left;">';
    if (!preview && !originAllowed(req.ret)) {
      m.innerHTML =
        box +
        '<h3>Liaison impossible</h3><p>Cette application n’est pas autorisée à recevoir de données de TJP.</p>' +
        '<div class="btn-row"><button class="btn btn-g" id="cfClose">FERMER</button></div></div>';
      document.body.appendChild(m);
      document.getElementById('cfClose').onclick = function () {
        localStorage.removeItem(LS_REQ);
        closeModal();
      };
      return;
    }
    m.innerHTML =
      box +
      (preview
        ? '<div style="background:#e11d48;color:#fff;font:700 10px monospace;text-align:center;padding:4px;margin:-8px -8px 12px;border-radius:4px;">SIMULATION — rien n’est envoyé ni créé</div>'
        : '') +
      '<h3>AUTORISER « ' + esc(req.label).toUpperCase() + ' »</h3>' +
      '<div id="cfZone"><p style="text-align:left;">Cette application recevra uniquement le <strong>P&amp;L</strong> (montant et date de chaque trade, <strong>hors backtest</strong>) des sous-comptes que tu coches. Aucune autre donnée de trade n’est partagée.</p>' +
      '<div id="cfAccList" style="margin:0;font-size:12px;color:var(--muted);">Chargement de tes sous-comptes…</div></div>' +
      '<p id="cfErr" style="display:none;color:var(--red);"></p>' +
      '<div class="btn-row"><button class="btn btn-g" id="cfDeny">REFUSER</button><button class="btn btn-p" id="cfOk" disabled>AUTORISER</button></div></div>';
    document.body.appendChild(m);

    var list = document.getElementById('cfAccList'),
      ok = document.getElementById('cfOk'),
      err = document.getElementById('cfErr');
    document.getElementById('cfDeny').onclick = function () {
      if (preview) return closeModal();
      backTo(req, {tjp_error: 'access_denied'});
    };

    var accs = [];
    if (preview) {
      accs = [
        {id: 'acc_demo', name: 'Compte démo'},
        {id: 'acc_reel', name: 'Compte réel'},
        {id: 'acc_invest', name: 'Compte d’investissement'}
      ];
    } else
    try {
      var r = await sb.from('journal_data').select('acc_id, acc_name, deleted').eq('user_id', currentUser.id);
      var seen = {};
      (r.data || []).forEach(function (x) {
        if (!x.acc_id || x.acc_id === '__global__' || x.deleted || seen[x.acc_id]) return;
        seen[x.acc_id] = 1;
        accs.push({id: x.acc_id, name: x.acc_name || x.acc_id});
      });
    } catch (e) {}
    if (!accs.length) {
      list.textContent = 'Aucun sous-compte trouvé sur ton compte TJP.';
      return;
    }
    list.style.color = 'inherit';
    list.innerHTML = accs
      .map(function (a, i) {
        return (
          '<label style="display:flex;gap:8px;align-items:center;padding:6px 0;cursor:pointer;">' +
          '<input type="checkbox" class="cfAcc" data-i="' + i + '"> <span>' + esc(a.name) + '</span></label>'
        );
      })
      .join('');
    function sync() {
      ok.disabled = !list.querySelector('.cfAcc:checked');
    }
    list.addEventListener('change', sync);
    ok.onclick = async function () {
      var ids = [].map.call(list.querySelectorAll('.cfAcc:checked'), function (c) {
        return accs[+c.dataset.i].id;
      });
      if (!ids.length) return;
      if (preview) {
        closeModal();
        alert('Simulation terminée : rien n’a été envoyé ni créé.');
        return;
      }
      ok.disabled = true;
      ok.textContent = '…';
      err.style.display = 'none';
      try {
        var s = (await sb.auth.getSession()).data.session;
        var resp = await fetch(FN_LINK, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + (s && s.access_token),
            apikey: window.SUPABASE_KEY
          },
          body: JSON.stringify({acc_ids: ids, label: req.label})
        });
        var out = await resp.json();
        if (!resp.ok || !out.token) throw new Error(out.error || 'erreur');
        backTo(req, {tjp_token: out.token, accounts: JSON.stringify(out.accounts || [])});
      } catch (e) {
        err.textContent = 'Impossible de créer la liaison (' + (e.message || 'erreur') + '). Réessaie.';
        err.style.display = 'block';
        ok.disabled = false;
        ok.textContent = 'AUTORISER';
      }
    };
  }

  // Simulation (pour tester l'apparence de la fenêtre sans rien créer) : window.tjpCashflowPreview()
  window.tjpCashflowPreview = function () {
    showAuthorize({ret: '', state: '', label: 'Cashflow Tracker'}, true);
  };

  // Attend que l'utilisateur soit connecté, que son PIN soit validé et que l'app soit chargée
  (function waitReady() {
    var t0 = Date.now();
    var iv = setInterval(function () {
      var req = readReq();
      if (!req || Date.now() - t0 > REQ_TTL) return clearInterval(iv);
      var ready =
        typeof currentUser !== 'undefined' &&
        currentUser &&
        !document.getElementById('loadingScreen') &&
        !document.getElementById('oauthWait') &&
        !document.querySelector('.auth-overlay.active');
      if (ready) {
        clearInterval(iv);
        showAuthorize(req);
      }
    }, 600);
  })();

  // ── 3. Paramètres → « APPLICATIONS LIÉES » (voir et révoquer les liaisons) ──
  function ensureCard() {
    var page = document.getElementById('page-modifs');
    if (!page) return null;
    var card = document.getElementById('cfLinksCard');
    if (card) return card;
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'cfLinksCard';
    card.innerHTML =
      '<div class="card-header"><div class="card-title">APPLICATIONS LIÉES</div></div>' +
      '<div class="card-body"><div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Applications autorisées à recevoir le P&amp;L (hors backtest) de tes sous-comptes. Révoquer coupe l’accès immédiatement.</div>' +
      '<div id="cfLinksList" style="font-size:12px;">…</div></div>';
    // Placée entre « CAPITAL & RISK » et « RISK MANAGEMENT — RÉGLAGES » (repérées via leur data-tvar)
    var capT = document.querySelector('[data-tvar="--crt-capitalrisk"]');
    var capCard = capT && capT.closest('.card');
    if (capCard && capCard.parentNode) capCard.parentNode.insertBefore(card, capCard.nextSibling);
    else page.appendChild(card);
    return card;
  }
  async function renderLinks() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    var card = ensureCard();
    if (!card) return;
    var box = document.getElementById('cfLinksList');
    var r = await sb
      .from('cashflow_links')
      .select('id, label, acc_ids, created_at, last_used_at')
      .order('created_at', {ascending: false});
    if (r.error) {
      box.textContent = 'Impossible de charger les liaisons.';
      return;
    }
    var names = {};
    try {
      getAccounts().forEach(function (a) {
        names[a.id] = a.name;
      });
    } catch (e) {}
    var fmt = function (d) {
      return d ? new Date(d).toLocaleDateString('fr-FR') : 'jamais';
    };
    if (!r.data.length) {
      box.textContent = 'Aucune application liée.';
      return;
    }
    box.innerHTML = r.data
      .map(function (l) {
        var accs = (l.acc_ids || [])
          .map(function (id) {
            return esc(names[id] || id);
          })
          .join(', ');
        return (
          '<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);">' +
          '<div><div><strong>' + esc(l.label || 'Application') + '</strong></div>' +
          '<div style="font-size:11px;color:var(--muted);">Sous-comptes : ' + accs + '<br>Liée le ' + fmt(l.created_at) +
          ' · dernière synchro : ' + fmt(l.last_used_at) + '</div></div>' +
          '<button class="btn btn-d" data-cf-revoke="' + esc(l.id) + '">RÉVOQUER</button></div>'
        );
      })
      .join('');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cf-revoke]');
    if (!b) return;
    var id = b.getAttribute('data-cf-revoke');
    showConfirm('Révoquer cette liaison ?', 'L’application ne pourra plus recevoir ton P&L.', async function () {
      await sb.from('cashflow_links').delete().eq('id', id);
      renderLinks();
    });
  });
  // Rafraîchit la liste quand on ouvre la page Paramètres
  var _sp = window.showPage;
  if (typeof _sp === 'function') {
    window.showPage = function (id) {
      var out = _sp.apply(this, arguments);
      if (id === 'modifs') renderLinks();
      return out;
    };
  }
})();
