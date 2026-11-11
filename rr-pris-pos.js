// RR Pris : reste toujours collé juste après RR Cible dans le formulaire
// (nouveau trade + édition), quel que soit l'ordre des questions.
// « Risque pris (€) » vient juste après RR Pris (ou juste après RR Cible tant que
// RR Pris est masqué, puisqu'un champ masqué ne prend pas de place).
(function () {
  function place(prefix) {
    var g = document.getElementById(prefix + '-rrpris-group');
    var c = document.getElementById(prefix + '-rrcible');
    var cg = c && c.closest('.fg');
    if (g && cg && cg.parentNode && cg.nextElementSibling !== g) cg.parentNode.insertBefore(g, cg.nextSibling);
    var rk = document.getElementById(prefix + '-risqueeur-group');
    var after = g || cg;
    if (rk && after && after.parentNode && after.nextElementSibling !== rk) after.parentNode.insertBefore(rk, after.nextSibling);
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
