/*
 * Vororder: der eigene Korb.
 *
 * Eine Vororder geht NICHT in den Shopify-Warenkorb. Dort würde Shopify jede
 * Menge auf den Lagerbestand kürzen, und eine Vororder bestellt Ware, die es
 * noch gar nicht gibt. Deshalb liegt der Vororder-Korb im Browser
 * (localStorage) und wird am Ende als E-Mail-Anfrage verschickt; Occulto
 * schreibt dann von Hand eine Rechnung.
 *
 * Zwei Seiten benutzen dieses Skript:
 *   /pages/vororder   die Auswahl       (.b2b-vo)
 *   /cart             die Übersicht     (.b2b-vk)
 *
 * Mengenregel: 0 oder mindestens 500 Packs je
 * Artikel, darüber in 5er-Schritten. Plus springt von 0 auf 500, Minus von
 * 500 auf 0. Getippte Werte werden auf den nächsten gültigen gerundet – so
 * kann im Korb nie eine ungültige Menge stehen, und es braucht keine
 * Fehlermeldungen.
 */
(function () {
  var SCHLUESSEL = 'b2b-vororder';
  var SCHRITT = 5;

  /* ---------------------------------------------------------------- Korb */

  /* localStorage kann in privaten Fenstern werfen oder leer zurückkommen.
     Dann läuft alles ohne Gedächtnis weiter – unschön, aber besser als eine
     Seite, die gar nicht reagiert. */
  function lesen() {
    try {
      var d = JSON.parse(localStorage.getItem(SCHLUESSEL));
      return d && typeof d === 'object' ? d : {};
    } catch (e) {
      return {};
    }
  }

  function schreiben(d) {
    try {
      localStorage.setItem(SCHLUESSEL, JSON.stringify(d));
    } catch (e) {}
  }

  function leeren() {
    try {
      localStorage.removeItem(SCHLUESSEL);
    } catch (e) {}
  }

  function setzen(id, eintrag) {
    var d = lesen();
    if (!eintrag || !eintrag.menge) {
      delete d[id];
    } else {
      d[id] = eintrag;
    }
    schreiben(d);
    return d;
  }

  /* -------------------------------------------------------------- Mengen */

  function gueltig(menge, mindest) {
    menge = parseInt(menge, 10) || 0;
    if (menge <= 0) return 0;
    if (menge < mindest) return mindest;
    return Math.ceil(menge / SCHRITT) * SCHRITT;
  }

  function mehr(menge, mindest) {
    return menge < mindest ? mindest : menge + SCHRITT;
  }

  function weniger(menge, mindest) {
    return menge <= mindest ? 0 : menge - SCHRITT;
  }

  /* ------------------------------------------------------------- Rechnen */

  function euro(cent) {
    return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  function auswertung(d, satz) {
    var posten = [];
    var packs = 0;
    var wert = 0;

    for (var id in d) {
      if (!Object.prototype.hasOwnProperty.call(d, id)) continue;
      var e = d[id];
      if (!e || !e.menge) continue;
      posten.push({ id: id, e: e });
      packs += e.menge;
      wert += e.menge * e.preis;
    }

    posten.sort(function (a, b) {
      return a.e.bezeichnung.localeCompare(b.e.bezeichnung, 'de');
    });

    /* Abgerundet: im Shop steht nie ein niedrigerer Preis als auf der
       Rechnung. */
    var abzug = Math.floor((wert * satz) / 100);
    return { posten: posten, packs: packs, wert: wert, abzug: abzug, summe: wert - abzug };
  }

  /* Ein Mengenfeld mit Minus und Plus. Wird in der Maske aus dem Markup
     übernommen und im Warenkorb neu gebaut – dieselbe Regel an beiden Stellen. */
  function verdrahten(feld, mindest, beiAenderung) {
    var eingabe = feld.querySelector('input');
    var minus = feld.querySelector('[data-minus]');
    var plus = feld.querySelector('[data-plus]');

    function uebernehmen(menge) {
      eingabe.value = menge > 0 ? menge : '';
      minus.disabled = menge <= 0;
      beiAenderung(menge);
    }

    minus.addEventListener('click', function () {
      uebernehmen(weniger(parseInt(eingabe.value, 10) || 0, mindest));
    });
    plus.addEventListener('click', function () {
      uebernehmen(mehr(parseInt(eingabe.value, 10) || 0, mindest));
    });
    /* Beim Tippen erst am Ende runden, nicht bei jeder Ziffer – sonst wird aus
       der ersten getippten "5" sofort eine 500. */
    eingabe.addEventListener('change', function () {
      uebernehmen(gueltig(eingabe.value, mindest));
    });

    minus.disabled = !(parseInt(eingabe.value, 10) > 0);
  }

  /* =====================================================================
     AUSWAHL  (/pages/vororder)
     ===================================================================== */

  function auswahl(wurzel) {
    var MINDEST = parseInt(wurzel.dataset.mindestmenge, 10) || 500;
    var SATZ = parseInt(wurzel.dataset.satz, 10) || 10;
    var leiste = document.querySelector('[data-vo-leiste]');
    var stand = leiste && leiste.querySelector('[data-stand]');
    var weiter = leiste && leiste.querySelector('[data-weiter]');

    function zeigen() {
      if (!stand) return;
      var a = auswertung(lesen(), SATZ);

      if (a.posten.length === 0) {
        stand.innerHTML = 'Noch nichts ausgewählt. Mindestens <strong>' + MINDEST + ' Packs</strong> je Artikel.';
        weiter.setAttribute('aria-disabled', 'true');
        weiter.classList.add('ist-gesperrt');
        return;
      }

      stand.innerHTML =
        '<strong>' + a.posten.length + (a.posten.length === 1 ? ' Artikel' : ' Artikel') + '</strong>' +
        ' · ' + a.packs.toLocaleString('de-DE') + ' Packs' +
        ' · <strong>' + euro(a.summe) + '</strong>' +
        ' <span class="b2b-vo-sparen">Du sparst ' + euro(a.abzug) + '</span>';
      weiter.removeAttribute('aria-disabled');
      weiter.classList.remove('ist-gesperrt');
    }

    var d = lesen();
    var felder = wurzel.querySelectorAll('[data-vo-zahl]');

    for (var i = 0; i < felder.length; i++) {
      (function (feld) {
        var id = feld.dataset.variante;
        if (d[id] && d[id].menge > 0) feld.querySelector('input').value = d[id].menge;

        verdrahten(feld, MINDEST, function (menge) {
          setzen(id, menge > 0 ? {
            menge: menge,
            bezeichnung: feld.dataset.bezeichnung,
            sku: feld.dataset.sku || '',
            preis: parseInt(feld.dataset.preis, 10) || 0,
            bild: feld.dataset.bild || ''
          } : null);
          zeigen();
        });
      })(felder[i]);
    }

    if (weiter) {
      weiter.addEventListener('click', function (ev) {
        if (weiter.getAttribute('aria-disabled') === 'true') ev.preventDefault();
      });
    }

    sortierung(wurzel);
    zeigen();
  }

  /* Ordnet die Produktblöcke der angezeigten Seite um. Über den ganzen
     Katalog geht es nicht: Liquid bekommt höchstens 50 Produkte je Seite. */
  function sortierung(wurzel) {
    var wahl = document.querySelector('.b2b-vo-leiste__wahl');
    var liste = wurzel.querySelector('.b2b-vo-liste');
    if (!wahl || !liste) return;

    var bloecke = Array.prototype.slice.call(liste.querySelectorAll('.b2b-vo-produkt'));
    bloecke.forEach(function (b, i) {
      b.dataset.rang = i;
    });

    wahl.addEventListener('change', function () {
      var art = wahl.value;
      var t = function (b, f) { return (b.dataset[f] || '').toLowerCase(); };
      var n = function (b, f) { return parseInt(b.dataset[f], 10) || 0; };

      bloecke.sort(function (a, b) {
        switch (art) {
          case 'name': return t(a, 'name').localeCompare(t(b, 'name'), 'de');
          case 'preis-auf': return n(a, 'preis') - n(b, 'preis');
          case 'preis-ab': return n(b, 'preis') - n(a, 'preis');
          case 'art':
            return t(a, 'art').localeCompare(t(b, 'art'), 'de') ||
              t(a, 'name').localeCompare(t(b, 'name'), 'de');
          default: return n(a, 'rang') - n(b, 'rang');
        }
      });

      var neu = document.createDocumentFragment();
      bloecke.forEach(function (b) { neu.appendChild(b); });
      liste.appendChild(neu);
    });
  }

  /* =====================================================================
     ÜBERSICHT  (/cart)
     ===================================================================== */

  function uebersicht(wurzel) {
    var MINDEST = parseInt(wurzel.dataset.mindestmenge, 10) || 500;
    var SATZ = parseInt(wurzel.dataset.satz, 10) || 10;

    var fertig = wurzel.querySelector('[data-vk-fertig]');
    var inhalt = wurzel.querySelector('[data-vk-inhalt]');
    var liste = wurzel.querySelector('[data-vk-liste]');
    var sparen = wurzel.querySelector('[data-vk-sparen]');
    var summen = wurzel.querySelector('[data-vk-summen]');
    var formular = wurzel.querySelector('form');
    var positionenFeld = wurzel.querySelector('[data-positionen]');
    var summeFeld = wurzel.querySelector('[data-summe]');

    /* Nach einem erfolgreichen Kontaktformular hängt Shopify
       ?contact_posted=true an die URL. Liquid kann Abfrageparameter nicht
       lesen, das Skript schon: Bestätigung zeigen, Korb leeren. */
    if (/[?&]contact_posted=true/.test(location.search) && lesen() && Object.keys(lesen()).length) {
      leeren();
      wurzel.hidden = false;
      fertig.hidden = false;
      inhalt.hidden = true;
      document.body.classList.add('b2b-hat-vororder');
      return;
    }

    function zeile(p) {
      var e = p.e;
      var li = document.createElement('li');
      li.className = 'b2b-vk-zeile';

      var zeilenwert = e.menge * e.preis;
      var zeilenabzug = Math.floor((zeilenwert * SATZ) / 100);

      li.innerHTML =
        '<span class="b2b-vk-zeile__bild"></span>' +
        '<div class="b2b-vk-zeile__text">' +
          '<p class="b2b-vk-zeile__name"></p>' +
          '<p class="b2b-vk-zeile__sku"></p>' +
          '<p class="b2b-vk-zeile__einzel"><s>' + euro(e.preis) + '</s> ' +
            euro(e.preis - Math.floor((e.preis * SATZ) / 100)) + ' / Pack</p>' +
        '</div>' +
        '<div class="b2b-vo-zahl" data-vo-zahl>' +
          '<button type="button" class="b2b-vo-zahl__knopf" data-minus aria-label="Weniger">−</button>' +
          '<input type="number" inputmode="numeric" min="0" step="5" value="' + e.menge + '" aria-label="Menge in Packs">' +
          '<button type="button" class="b2b-vo-zahl__knopf" data-plus aria-label="Mehr">+</button>' +
        '</div>' +
        '<p class="b2b-vk-zeile__summe"><s>' + euro(zeilenwert) + '</s><strong>' + euro(zeilenwert - zeilenabzug) + '</strong></p>' +
        '<button type="button" class="b2b-vk-zeile__weg" aria-label="Entfernen">Entfernen</button>';

      /* Namen per textContent, nicht per innerHTML: sie kommen aus dem
         localStorage und sind damit Eingabe, kein vertrauenswürdiges Markup. */
      li.querySelector('.b2b-vk-zeile__name').textContent = e.bezeichnung;
      li.querySelector('.b2b-vk-zeile__sku').textContent = e.sku ? 'Art.-Nr. ' + e.sku : '';
      if (e.bild) {
        var bild = document.createElement('img');
        bild.className = 'b2b-vk-zeile__bild';
        bild.src = e.bild;
        bild.alt = '';
        bild.width = 64;
        bild.height = 64;
        bild.loading = 'lazy';
        li.replaceChild(bild, li.querySelector('.b2b-vk-zeile__bild'));
      }

      verdrahten(li.querySelector('[data-vo-zahl]'), MINDEST, function (menge) {
        var neu = lesen()[p.id];
        if (neu) neu.menge = menge;
        setzen(p.id, menge > 0 ? neu : null);
        zeichnen();
      });

      li.querySelector('.b2b-vk-zeile__weg').addEventListener('click', function () {
        setzen(p.id, null);
        zeichnen();
      });

      return li;
    }

    function zeichnen() {
      var a = auswertung(lesen(), SATZ);
      var da = a.posten.length > 0;

      /* Leerer Vororder-Korb: kein Block, kein Rabattkopf. Und nur dann,
         wenn er etwas enthält, darf Shopifys "Dein Warenkorb ist leer"
         verschwinden. */
      wurzel.hidden = !da;
      document.body.classList.toggle('b2b-hat-vororder', da);
      if (!da) return;

      liste.innerHTML = '';
      a.posten.forEach(function (p) {
        liste.appendChild(zeile(p));
      });

      sparen.textContent = 'Du sparst ' + euro(a.abzug);
      summen.innerHTML =
        '<div><dt>' + a.posten.length + ' Artikel · ' + a.packs.toLocaleString('de-DE') + ' Packs</dt><dd>' + euro(a.wert) + '</dd></div>' +
        '<div><dt>Vororder-Rabatt ' + SATZ + ' %</dt><dd>−' + euro(a.abzug) + '</dd></div>' +
        '<div class="b2b-vk-summen__gesamt"><dt>Summe netto</dt><dd>' + euro(a.summe) + '</dd></div>';
    }

    /* Die Positionsliste entsteht erst beim Absenden. Sie ist Text, weil sie
       in einer E-Mail landet und dort von Hand gelesen wird. */
    if (formular) {
      formular.addEventListener('submit', function (ev) {
        var a = auswertung(lesen(), SATZ);
        if (a.posten.length === 0) {
          ev.preventDefault();
          return;
        }

        positionenFeld.value = a.posten.map(function (p) {
          var e = p.e;
          return (e.sku ? e.sku + '  ' : '') + e.bezeichnung + '  ' + e.menge + ' Packs  à ' +
            euro(e.preis) + '  = ' + euro(e.menge * e.preis);
        }).join('\n');

        summeFeld.value = a.packs + ' Packs, Listenwert ' + euro(a.wert) + ', abzüglich ' + SATZ +
          ' % (' + euro(a.abzug) + ') = ' + euro(a.summe) + ' netto';
      });
    }

    zeichnen();
  }

  /* ----------------------------------------------------------------- Start */

  var vo = document.querySelector('.b2b-vo');
  if (vo) auswahl(vo);

  var vk = document.querySelector('.b2b-vk');
  if (vk) uebersicht(vk);
})();
