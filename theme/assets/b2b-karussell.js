/* Karussell fuer die B2B-Landingpage.
   Sucht im ganzen Dokument nach [data-karussell] und richtet jedes genau
   einmal ein - die Datei wird von mehreren Abschnitten eingebunden. */
(function () {
  function richteEin(karussell) {
    if (karussell.dataset.karussellBereit === 'ja') return;
    karussell.dataset.karussellBereit = 'ja';

    var spur = karussell.querySelector('[data-spur]');
    var zurueck = karussell.querySelector('[data-zurueck]');
    var vor = karussell.querySelector('[data-vor]');
    if (!spur) return;

    function schrittweite() {
      var erstes = spur.firstElementChild;
      if (!erstes) return spur.clientWidth;
      var stil = window.getComputedStyle(spur);
      return erstes.getBoundingClientRect().width + parseFloat(stil.columnGap || stil.gap || 0);
    }

    // Endlos: am Ende geht es wieder von vorne los, die Pfeile bleiben
    // immer bedienbar. Ohne data-endlos wird am Rand deaktiviert.
    var endlos = karussell.hasAttribute('data-endlos');

    function maximum() {
      return spur.scrollWidth - spur.clientWidth;
    }

    function aktualisiere() {
      var passtKomplett = maximum() <= 2;
      if (zurueck) zurueck.disabled = passtKomplett || (!endlos && spur.scrollLeft <= 2);
      if (vor) vor.disabled = passtKomplett || (!endlos && spur.scrollLeft >= maximum() - 2);
    }

    // Der Zustand darf nicht allein am scroll-Ereignis haengen: wo das nicht
    // feuert, blieben die Pfeile dauerhaft falsch deaktiviert.
    function bewege(richtung) {
      var max = maximum();
      if (max <= 2) return;
      if (endlos && richtung > 0 && spur.scrollLeft >= max - 2) {
        spur.scrollLeft = 0;
      } else if (endlos && richtung < 0 && spur.scrollLeft <= 2) {
        spur.scrollLeft = max;
      } else {
        spur.scrollLeft += richtung * schrittweite();
      }
      aktualisiere();
      setTimeout(aktualisiere, 450);
    }

    if (zurueck) zurueck.addEventListener('click', function () { bewege(-1); });
    if (vor) vor.addEventListener('click', function () { bewege(1); });
    spur.addEventListener('scroll', aktualisiere, { passive: true });
    window.addEventListener('resize', aktualisiere);
    aktualisiere();
  }

  function alle() {
    document.querySelectorAll('[data-karussell]').forEach(richteEin);
  }

  alle();
  document.addEventListener('DOMContentLoaded', alle);
  // Der Theme-Editor baut Abschnitte neu auf, ohne die Seite zu laden.
  document.addEventListener('shopify:section:load', alle);
})();
