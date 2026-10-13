/* Das Spinrad fuer die Bestseller.

   Der Abschnitt bleibt stehen, und das Scrollen dreht die Kacheln von rechts
   nach links durch: die mittlere gross und gerade, die seitlichen kleiner,
   weggedreht und teilweise verdeckt.

   WARUM MIT SKRIPT UND NICHT MIT animation-timeline
   Dieselbe Begruendung wie bei der Punktleiste und dem Ablauf: die
   Scroll-Zeitachse liefert in diesem Theme immer wieder currentTime null, und
   dann bliebe das Rad stehen. Das Skript rechnet den Fortschritt selbst aus.

   OHNE SKRIPT, unter 761 Bildpunkten Breite und bei abbestellter Bewegung
   passiert nichts: dann bleibt die waagrecht scrollende Reihe mit ihren
   Pfeilen, die ohnehin die bessere Bedienung auf einem Telefon ist. */
(function () {
  /* Winkelabstand zweier Kacheln auf dem Rad. Groesser heisst: die seitlichen
     rutschen schneller weg, werden kleiner und ruecken auseinander - bei 30
     Grad stehen links und rechts je zwei Nachbarn, bevor sie verschwinden. */
  var SCHRITT = 30;
  /* Ab hier ist eine Kachel so weit weggedreht, dass sie nur noch stoert.
     Bei dieser Kachelgroesse stehen damit die Mitte und je ein Nachbar im
     Bild - mehr passt bei 440 Bildpunkten Breite nicht nebeneinander, ohne
     dass die Namen uebereinanderliegen. */
  var GRENZE = 55;
  /* Seitlicher Ausschlag, als Anteil der Spurbreite. */
  var RADIUS_ANTEIL = 0.62;
  /* Wie weit die seitlichen Kacheln nach hinten wandern. */
  var TIEFE = 300;
  /* Nur ein Teil der Winkeldrehung wird auch als Drehung gezeigt. Voll
     gedreht stuenden die Nachbarn fast auf der Kante. */
  var DREHANTEIL = 0.55;

  function einrichten(rad) {
    if (rad.dataset.radBereit === 'ja') return;
    rad.dataset.radBereit = 'ja';

    var buehne = rad.closest('.b2b-rad-buehne');
    var lage = buehne && buehne.querySelector('.b2b-rad-kleben');
    var spur = rad.querySelector('[data-spur]');
    if (!buehne || !lage || !spur) return;

    var kacheln = Array.prototype.slice.call(spur.children);
    if (kacheln.length < 3) return;

    var breitGenug = window.matchMedia('(min-width: 761px)');
    var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)');
    var an = false;
    var letzteMitte = -1;

    /* Die Punkte unter dem Rad. Ohne sie steht man in einem Abschnitt, der
       sich beim Scrollen nicht von der Stelle bewegt, und weiss nicht warum. */
    var leiste = document.createElement('ul');
    leiste.className = 'b2b-rad-leiste';
    leiste.setAttribute('aria-hidden', 'true');
    for (var n = 0; n < kacheln.length; n++) leiste.appendChild(document.createElement('li'));
    rad.appendChild(leiste);
    var punkte = Array.prototype.slice.call(leiste.children);

    function messen() {
      /* Die Buehne ist so hoch wie die stehende Lage plus dem Weg, den das Rad
         zum Durchdrehen braucht: ein Takt je Abstand zwischen zwei Kacheln. */
      var takt = parseFloat(getComputedStyle(buehne).getPropertyValue('--b2b-rad-takt')) || 160;
      buehne.style.setProperty('--b2b-rad-weg', (kacheln.length - 1) * takt + 'px');

      /* Die Spur braucht eine feste Hoehe, weil die Kacheln absolut darin
         liegen. Gemessen an der hoechsten - sie sind unterschiedlich hoch,
         wenn ein Name zweizeilig wird. */
      var hoch = 0;
      kacheln.forEach(function (k) {
        var h = k.getBoundingClientRect().height;
        if (h > hoch) hoch = h;
      });
      if (hoch > 0) spur.style.setProperty('--b2b-rad-hoehe', Math.ceil(hoch) + 'px');
    }

    function zeichne() {
      if (!an) return;

      var r = buehne.getBoundingClientRect();
      var weg = r.height - lage.getBoundingClientRect().height;
      /* Nullpunkt ist der Haftpunkt der Lage, nicht die Fensteroberkante -
         sie klebt unter der Kopfzeile. */
      var oben = parseFloat(getComputedStyle(lage).top) || 0;
      var anteil = weg > 0 ? Math.min(1, Math.max(0, (oben - r.top) / weg)) : 0;

      var mitte = anteil * (kacheln.length - 1);
      var radius = spur.clientWidth * RADIUS_ANTEIL;

      kacheln.forEach(function (kachel, i) {
        var abstand = i - mitte;
        var winkel = abstand * SCHRITT;

        if (Math.abs(winkel) > GRENZE) {
          kachel.style.visibility = 'hidden';
          return;
        }
        var bogen = (winkel * Math.PI) / 180;
        var x = Math.sin(bogen) * radius;
        var z = (Math.cos(bogen) - 1) * TIEFE;
        /* Quadriert, damit die Mitte deutlicher heraussticht: linear fiel der
           direkte Nachbar nur um ein Zehntel ab und beide wirkten gleich
           wichtig. */
        var groesse = 0.42 + 0.58 * Math.cos(bogen) * Math.cos(bogen);

        kachel.style.visibility = 'visible';
        kachel.style.opacity = Math.max(0, Math.cos(bogen)).toFixed(3);
        kachel.style.zIndex = String(100 - Math.round(Math.abs(abstand) * 10));
        kachel.style.transform =
          'translate3d(' +
          x.toFixed(1) +
          'px, 0, ' +
          z.toFixed(1) +
          'px) rotateY(' +
          (-winkel * DREHANTEIL).toFixed(1) +
          'deg) scale(' +
          groesse.toFixed(3) +
          ')';
      });

      var naechste = Math.round(mitte);
      if (naechste !== letzteMitte) {
        letzteMitte = naechste;
        kacheln.forEach(function (k, i) {
          k.classList.toggle('ist-mitte', i === naechste);
        });
        punkte.forEach(function (p, i) {
          p.classList.toggle('ist-aktiv', i === naechste);
        });
      }
    }

    function aufraeumen() {
      kacheln.forEach(function (k) {
        k.style.visibility = '';
        k.style.opacity = '';
        k.style.zIndex = '';
        k.style.transform = '';
        k.classList.remove('ist-mitte');
      });
      spur.style.removeProperty('--b2b-rad-hoehe');
      buehne.style.removeProperty('--b2b-rad-weg');
      letzteMitte = -1;
    }

    function pruefen() {
      var soll = breitGenug.matches && !ruhig.matches;
      if (soll !== an) {
        an = soll;
        rad.classList.toggle('ist-rad', an);
        buehne.classList.toggle('ist-rad', an);
        if (!an) return aufraeumen();
        messen();
      }
      if (an) zeichne();
    }

    /* Ein Klick auf eine seitliche Kachel holt sie in die Mitte, statt die
       Produktseite zu oeffnen. Am Rand ist die Kachel klein, halb verdeckt
       und meist gar nicht gemeint - wer sie trifft, will sie ansehen. Die
       Produktseite steht danach einen Klick entfernt in der Mitte. */
    kacheln.forEach(function (kachel, i) {
      kachel.addEventListener("click", function (e) {
        if (!an || kachel.classList.contains("ist-mitte")) return;
        e.preventDefault();
        var r = buehne.getBoundingClientRect();
        var weg = r.height - lage.getBoundingClientRect().height;
        if (weg <= 0) return;
        var oben = parseFloat(getComputedStyle(lage).top) || 0;
        // Der Scrollstand, an dem das Kleben beginnt - von dort aus liegt
        // jede Kachel auf ihrem Anteil des Laufwegs.
        var start = window.scrollY + r.top - oben;
        // Ohne behavior: smooth - das schluckt diese Seite, gemessen bleibt
        // der Scrollstand dann einfach stehen. Stoert hier nicht: ein Schritt
        // ist genau ein Takt weit, also 100 Bildpunkte.
        window.scrollTo(0, start + (i / (kacheln.length - 1)) * weg);
      });
    });

    /* Direkt am Scroll-Ereignis statt ueber requestAnimationFrame: der Browser
       fasst Scroll-Ereignisse ohnehin auf ein Bild zusammen, und eine
       Drosselung, die auf rAF wartet, laesst das Rad stehen, sobald der
       Browser nicht zeichnet. */
    window.addEventListener('scroll', zeichne, { passive: true });
    window.addEventListener(
      'resize',
      function () {
        if (an) messen();
        pruefen();
      },
      { passive: true },
    );
    if (breitGenug.addEventListener) {
      breitGenug.addEventListener('change', pruefen);
      ruhig.addEventListener('change', pruefen);
    }
    /* Die Kachelhoehe steht erst fest, wenn die Produktbilder da sind. */
    window.addEventListener('load', function () {
      if (an) messen();
      zeichne();
    });
    pruefen();
  }

  function alle() {
    document.querySelectorAll('[data-rad]').forEach(einrichten);
  }

  alle();
  document.addEventListener('DOMContentLoaded', alle);
  // Der Theme-Editor baut Abschnitte neu auf, ohne die Seite zu laden.
  document.addEventListener('shopify:section:load', alle);
})();
