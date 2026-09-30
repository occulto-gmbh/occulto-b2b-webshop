/*
 * Vororder-Maske.
 *
 * Eine Vororder geht nicht in den Warenkorb, sondern als E-Mail-Anfrage über
 * Shopifys Kontaktformular. Dieses Skript hält die Mengen, rechnet die Summe
 * und schreibt beim Absenden die Positionsliste in ein verstecktes Feld.
 *
 * Warum localStorage und nicht einfach die Eingabefelder: Shopify gibt Liquid
 * höchstens 50 Produkte je Seite, der Katalog hat 108. Wer auf Seite 2
 * blättert, verlöre sonst, was er auf Seite 1 eingetragen hat.
 */
(function () {
  var SCHLUESSEL = 'b2b-vororder';

  /* Nach einem erfolgreichen Kontaktformular haengt Shopify
     ?contact_posted=true an die URL. Liquid kann Abfrageparameter nicht
     lesen, deshalb wird die Bestaetigung hier aufgedeckt und die Maske
     eingeklappt - und die Mengen im Speicher geleert, damit die naechste
     Vororder bei null anfaengt. */
  var fertig = document.querySelector('[data-fertig]');
  var maske = document.querySelector('[data-maske]');

  if (fertig && maske && /[?&]contact_posted=true/.test(location.search)) {
    fertig.hidden = false;
    maske.hidden = true;
    try {
      localStorage.removeItem(SCHLUESSEL);
    } catch (e) {}
    return;
  }

  var wurzel = document.querySelector('.b2b-vo');
  var fuss = document.querySelector('.b2b-vo-fuss');
  if (!wurzel || !fuss) return;

  var MINDEST = parseInt(wurzel.dataset.mindestmenge, 10) || 500;
  var SATZ = parseInt(wurzel.dataset.satz, 10) || 10;

  var stand = fuss.querySelector('[data-stand]');
  var fehlerfeld = fuss.querySelector('[data-fehler]');
  var positionenFeld = fuss.querySelector('[data-positionen]');
  var summeFeld = fuss.querySelector('[data-summe]');
  var knopf = fuss.querySelector('[data-absenden]');
  var formular = fuss.querySelector('form');

  /* localStorage kann in privaten Fenstern werfen oder leer zurückkommen.
     Dann läuft die Maske ohne Gedächtnis weiter - unschön, aber besser als
     eine Seite, die gar nicht reagiert. */
  function lesen() {
    try {
      return JSON.parse(localStorage.getItem(SCHLUESSEL)) || {};
    } catch (e) {
      return {};
    }
  }

  function schreiben(daten) {
    try {
      localStorage.setItem(SCHLUESSEL, JSON.stringify(daten));
    } catch (e) {}
  }

  function euro(cent) {
    return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  var daten = lesen();

  /* Beim Laden die Felder dieser Seite aus dem Gedächtnis füllen. */
  var felder = wurzel.querySelectorAll('.b2b-vo-menge');
  for (var i = 0; i < felder.length; i++) {
    var eintrag = daten[felder[i].dataset.variante];
    if (eintrag && eintrag.menge > 0) felder[i].value = eintrag.menge;
  }

  function merken(feld) {
    var id = feld.dataset.variante;
    var menge = parseInt(feld.value, 10);

    if (!menge || menge <= 0) {
      delete daten[id];
    } else {
      daten[id] = {
        menge: menge,
        bezeichnung: feld.dataset.bezeichnung,
        sku: feld.dataset.sku || '',
        preis: parseInt(feld.dataset.preis, 10) || 0
      };
    }

    schreiben(daten);
    zeigen();
  }

  function auswertung() {
    var posten = [];
    var packs = 0;
    var wert = 0;
    var zuKlein = [];

    for (var id in daten) {
      if (!Object.prototype.hasOwnProperty.call(daten, id)) continue;
      var e = daten[id];
      posten.push(e);
      packs += e.menge;
      wert += e.menge * e.preis;
      if (e.menge < MINDEST) zuKlein.push(e);
    }

    posten.sort(function (a, b) {
      return a.bezeichnung.localeCompare(b.bezeichnung, 'de');
    });

    var abzug = Math.floor((wert * SATZ) / 100);
    return { posten: posten, packs: packs, wert: wert, abzug: abzug, zuKlein: zuKlein };
  }

  function zeigen() {
    var a = auswertung();

    if (a.posten.length === 0) {
      stand.textContent = 'Noch nichts ausgewählt.';
    } else {
      stand.innerHTML =
        '<strong>' +
        a.posten.length +
        (a.posten.length === 1 ? ' Position' : ' Positionen') +
        '</strong> · ' +
        a.packs +
        ' Packs · ' +
        euro(a.wert - a.abzug) +
        ' <span class="b2b-vo-fuss__sparen">Du sparst ' +
        euro(a.abzug) +
        '</span>';
    }

    /* Die Mindestmenge gilt je Artikel, nicht für die Vororder insgesamt.
       Deshalb wird jede zu kleine Position einzeln genannt - sonst sucht der
       Händler in 108 Artikeln nach der einen. */
    if (a.zuKlein.length > 0) {
      var namen = a.zuKlein
        .map(function (e) {
          return e.bezeichnung + ' (' + e.menge + ')';
        })
        .join(', ');
      fehlerfeld.hidden = false;
      fehlerfeld.textContent =
        'Unter ' + MINDEST + ' Packs je Artikel: ' + namen + '. Bitte erhöhen oder entfernen.';
    } else {
      fehlerfeld.hidden = true;
      fehlerfeld.textContent = '';
    }

    var bereit = a.posten.length > 0 && a.zuKlein.length === 0;
    knopf.disabled = !bereit;
  }

  wurzel.addEventListener('input', function (ereignis) {
    if (ereignis.target.classList.contains('b2b-vo-menge')) merken(ereignis.target);
  });

  /* Die Positionsliste entsteht erst beim Absenden. Sie ist Text, weil sie in
     einer E-Mail landet und dort von Hand gelesen wird. */
  if (formular) {
    formular.addEventListener('submit', function (ereignis) {
      var a = auswertung();

      if (a.posten.length === 0 || a.zuKlein.length > 0) {
        ereignis.preventDefault();
        zeigen();
        return;
      }

      positionenFeld.value = a.posten
        .map(function (e) {
          return (
            (e.sku ? e.sku + '  ' : '') +
            e.bezeichnung +
            '  ' +
            e.menge +
            ' Packs  à ' +
            euro(e.preis) +
            '  = ' +
            euro(e.menge * e.preis)
          );
        })
        .join('\n');

      summeFeld.value =
        a.packs +
        ' Packs, Listenwert ' +
        euro(a.wert) +
        ', abzüglich ' +
        SATZ +
        ' % (' +
        euro(a.abzug) +
        ') = ' +
        euro(a.wert - a.abzug);
    });
  }

  /* ---- Sortierung ----
     Ordnet die Produktblöcke dieser Seite um. Über den ganzen Katalog geht es
     nicht: Liquid bekommt höchstens 50 Produkte je Seite. */
  var wahl = document.querySelector('.b2b-vo-leiste__wahl');
  var liste = wurzel.querySelector('.b2b-vo-liste');

  if (wahl && liste) {
    var bloecke = Array.prototype.slice.call(liste.querySelectorAll('.b2b-vo-produkt'));
    bloecke.forEach(function (b, i) {
      b.dataset.rang = i;
    });

    wahl.addEventListener('change', function () {
      var art = wahl.value;
      var t = function (b, f) {
        return (b.dataset[f] || '').toLowerCase();
      };
      var n = function (b, f) {
        return parseInt(b.dataset[f], 10) || 0;
      };

      bloecke.sort(function (a, b) {
        switch (art) {
          case 'name':
            return t(a, 'name').localeCompare(t(b, 'name'), 'de');
          case 'preis-auf':
            return n(a, 'preis') - n(b, 'preis');
          case 'preis-ab':
            return n(b, 'preis') - n(a, 'preis');
          case 'art':
            return (
              t(a, 'art').localeCompare(t(b, 'art'), 'de') ||
              t(a, 'name').localeCompare(t(b, 'name'), 'de')
            );
          default:
            return n(a, 'rang') - n(b, 'rang');
        }
      });

      var neu = document.createDocumentFragment();
      bloecke.forEach(function (b) {
        neu.appendChild(b);
      });
      liste.appendChild(neu);
    });
  }

  zeigen();
})();
