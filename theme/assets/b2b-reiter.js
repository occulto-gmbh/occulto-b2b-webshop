/* Reiter fuer die B2B-Seiten.
   Sucht im ganzen Dokument nach [data-reiter] und richtet jede Gruppe genau
   einmal ein - die Datei wird von mehreren Abschnitten eingebunden. */
(function () {
  function richteEin(gruppe) {
    if (gruppe.dataset.reiterBereit === 'ja') return;
    gruppe.dataset.reiterBereit = 'ja';

    var knoepfe = Array.prototype.slice.call(gruppe.querySelectorAll('[role="tab"]'));
    var felder = Array.prototype.slice.call(gruppe.querySelectorAll('[role="tabpanel"]'));
    if (!knoepfe.length || knoepfe.length !== felder.length) return;

    function zeige(index) {
      knoepfe.forEach(function (k, i) {
        var aktiv = i === index;
        k.setAttribute('aria-selected', aktiv ? 'true' : 'false');
        k.tabIndex = aktiv ? 0 : -1;
        felder[i].hidden = !aktiv;
      });
    }

    knoepfe.forEach(function (knopf, i) {
      knopf.addEventListener('click', function () {
        zeige(i);
      });
      knopf.addEventListener('keydown', function (e) {
        var richtung = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!richtung) return;
        e.preventDefault();
        var ziel = (i + richtung + knoepfe.length) % knoepfe.length;
        zeige(ziel);
        knoepfe[ziel].focus();
      });
    });

    // Startzustand setzen, damit die Seite auch ohne vorherige Auswahl stimmt.
    var start = knoepfe.findIndex(function (k) {
      return k.getAttribute('aria-selected') === 'true';
    });
    zeige(start < 0 ? 0 : start);
  }

  function alle() {
    document.querySelectorAll('[data-reiter]').forEach(richteEin);
  }

  alle();
  document.addEventListener('DOMContentLoaded', alle);
  document.addEventListener('shopify:section:load', alle);
})();
