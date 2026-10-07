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
 * Mengenregeln (Werte aus den Abschnitts-Einstellungen):
 *   je Größe      0 oder ab 5 Packs, in 5er-Schritten
 *   je Artikel    alle Größen zusammen mindestens 100 Packs
 *   je Vororder   mindestens 1.500 € nach Rabatt
 * Die Größe wird beim Tippen gerundet, so steht nie eine ungültige Größe im
 * Korb. Artikel- und Gesamtgrenze dagegen kann man erst erreichen, wenn alles
 * gewählt ist – sie werden angezeigt und sperren erst das Absenden.
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

  /* Ganze Beträge ohne ",00" (1.500 €), sonst mit Cent (22,50 €). */
  function euro(cent) {
    var ganz = cent % 100 === 0;
    return (cent / 100).toLocaleString('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: ganz ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function regeln(wurzel) {
    return {
      artikel: parseInt(wurzel.dataset.mindestmenge, 10) || 100,
      groesse: parseInt(wurzel.dataset.groesse, 10) || 5,
      wert: (parseInt(wurzel.dataset.mindestwert, 10) || 1500) * 100,
      satz: parseInt(wurzel.dataset.satz, 10) || 10
    };
  }

  /* Ältere Einträge kennen ihren Artikel noch nicht: dann gilt der Teil der
     Bezeichnung vor " / ", also der Produktname. */
  function artikelVon(e) {
    return e.artikel || String(e.bezeichnung || '').split(' / ')[0];
  }

  function auswertung(d, r) {
    var posten = [];
    var packs = 0;
    var wert = 0;
    var artikel = {};

    for (var id in d) {
      if (!Object.prototype.hasOwnProperty.call(d, id)) continue;
      var e = d[id];
      if (!e || !e.menge) continue;
      posten.push({ id: id, e: e });
      packs += e.menge;
      wert += e.menge * e.preis;
      var a = artikelVon(e);
      if (!artikel[a]) artikel[a] = { name: e.artikelName || a, packs: 0 };
      artikel[a].packs += e.menge;
    }

    posten.sort(function (x, y) {
      return x.e.bezeichnung.localeCompare(y.e.bezeichnung, 'de');
    });

    /* Abgerundet: im Shop steht nie ein niedrigerer Preis als auf der
       Rechnung. */
    var abzug = Math.floor((wert * r.satz) / 100);
    var summe = wert - abzug;
    var zuWenig = [];
    for (var k in artikel) {
      if (artikel[k].packs < r.artikel) zuWenig.push(artikel[k]);
    }
    zuWenig.sort(function (x, y) { return x.name.localeCompare(y.name, 'de'); });

    return {
      posten: posten, packs: packs, wert: wert, abzug: abzug, summe: summe,
      artikel: artikel, anzahlArtikel: Object.keys(artikel).length,
      zuWenig: zuWenig, fehlt: Math.max(0, r.wert - summe),
      ok: posten.length > 0 && zuWenig.length === 0 && summe >= r.wert
    };
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
    /* Beim Tippen erst am Ende runden, nicht bei jeder Ziffer. */
    eingabe.addEventListener('change', function () {
      uebernehmen(gueltig(eingabe.value, mindest));
    });

    minus.disabled = !(parseInt(eingabe.value, 10) > 0);
  }

  /* =====================================================================
     AUSWAHL  (/pages/vororder)
     ===================================================================== */

  /* Liquid bekommt höchstens 50 Produkte je Seite. Damit Suche und
     Sortierung über das ganze Sortiment gehen, holt die Maske die übrigen
     Seiten nach und hängt deren Produktkarten an. Jede angehängte Karte
     meldet sich über beiAnhaengen, damit sie sofort bedienbar ist.
     Schlägt das Nachladen fehl, bleibt die normale Seitennavigation. */
  function alleSeitenLaden(wurzel, beiAnhaengen) {
    var seiten = parseInt(wurzel.dataset.seiten, 10) || 1;
    var aktuell = parseInt(wurzel.dataset.seite, 10) || 1;
    var abschnitt = wurzel.dataset.abschnitt;
    var liste = wurzel.querySelector('.b2b-vo-liste');
    if (seiten <= 1 || !abschnitt || !liste || !window.fetch || !window.DOMParser) return Promise.resolve();

    function holen(url) {
      return fetch(url, { credentials: 'same-origin' })
        .then(function (antwort) { return antwort.ok ? antwort.text() : ''; })
        .catch(function () { return ''; });
    }

    /* Erst nur den Abschnitt (schlank). Liefert der keine Produkte - die
       lokale Vorschau kennt die Section Rendering API nicht -, die ganze Seite. */
    var abrufe = [];
    for (var s = 1; s <= seiten; s++) {
      if (s === aktuell) continue;
      (function (seite) {
        var basis = location.pathname + '?page=' + seite;
        abrufe.push(
          holen(basis + '&section_id=' + encodeURIComponent(abschnitt))
            .then(function (html) {
              return html.indexOf('b2b-vo-produkt') > -1 ? html : holen(basis);
            })
            .then(function (html) { return { seite: seite, html: html }; })
        );
      })(s);
    }

    return Promise.all(abrufe).then(function (teile) {
      var erste = liste.firstElementChild;
      var vollstaendig = true;
      teile.forEach(function (t) {
        var bloecke = new DOMParser().parseFromString(t.html, 'text/html').querySelectorAll('.b2b-vo-produkt');
        if (!bloecke.length) vollstaendig = false;
        for (var i = 0; i < bloecke.length; i++) {
          var b = document.importNode(bloecke[i], true);
          if (t.seite < aktuell) liste.insertBefore(b, erste);
          else liste.appendChild(b);
          beiAnhaengen(b);
        }
      });
      if (vollstaendig) {
        var navi = wurzel.querySelectorAll('.pagination-wrapper');
        for (var n = 0; n < navi.length; n++) navi[n].hidden = true;
      }
    });
  }

  function auswahl(wurzel) {
    var R = regeln(wurzel);
    var leiste = document.querySelector('[data-vo-leiste]');
    var stand = leiste && leiste.querySelector('[data-stand]');
    var weiter = leiste && leiste.querySelector('[data-weiter]');

    /* Unter jedem Produkt: wie weit die Mindestmenge des Artikels ist. */
    function artikelStand(block) {
      var ziel = block.querySelector('[data-artikel-stand]');
      if (!ziel) return;
      var packs = 0;
      var felder = block.querySelectorAll('[data-vo-zahl]');
      for (var i = 0; i < felder.length; i++) packs += parseInt(felder[i].querySelector('input').value, 10) || 0;
      ziel.hidden = packs === 0;
      ziel.classList.toggle('ist-erreicht', packs >= R.artikel);
      ziel.textContent = packs >= R.artikel
        ? packs.toLocaleString('de-DE') + ' Packs – Mindestmenge erreicht'
        : packs.toLocaleString('de-DE') + ' von mindestens ' + R.artikel + ' Packs für diesen Artikel';
    }

    function zeigen() {
      if (!stand) return;
      var a = auswertung(lesen(), R);

      if (a.posten.length === 0) {
        stand.innerHTML = 'Noch nichts ausgewählt. Je Artikel mindestens <strong>' + R.artikel +
          ' Packs</strong>, insgesamt ab <strong>' + euro(R.wert) + '</strong>.';
        weiter.setAttribute('aria-disabled', 'true');
        weiter.classList.add('ist-gesperrt');
        return;
      }

      var offen = '';
      if (a.zuWenig.length) offen = a.zuWenig.length + ' Artikel noch unter ' + R.artikel + ' Packs';
      else if (a.fehlt) offen = 'noch ' + euro(a.fehlt) + ' bis ' + euro(R.wert);

      stand.innerHTML =
        '<strong>' + a.anzahlArtikel + ' Artikel</strong>' +
        ' · ' + a.packs.toLocaleString('de-DE') + ' Packs' +
        ' · <strong>' + euro(a.summe) + '</strong>' +
        ' <span class="b2b-vo-sparen">Du sparst ' + euro(a.abzug) + '</span>' +
        (offen ? ' <span class="b2b-vo-offen">' + offen + '</span>' : '');
      weiter.removeAttribute('aria-disabled');
      weiter.classList.remove('ist-gesperrt');
    }

    /* Eine Produktkarte bedienbar machen: Mengen aus dem Korb übernehmen,
       Felder verdrahten. Läuft für jede Karte genau einmal - für die der
       Seite sofort, für nachgeladene beim Anhängen. */
    function karte(block) {
      var d = lesen();
      var felder = block.querySelectorAll('[data-vo-zahl]');
      for (var i = 0; i < felder.length; i++) {
        (function (feld) {
          var id = feld.dataset.variante;
          var e = d[id];
          if (e && e.menge > 0) {
            feld.querySelector('input').value = e.menge;
            /* Ältere Einträge ohne Artikel nachtragen, sonst zählten sie
               als eigener Artikel neben neuen derselben Socke. */
            if (!e.artikel && feld.dataset.artikel) {
              e.artikel = feld.dataset.artikel;
              e.artikelName = feld.dataset.artikelName || '';
              setzen(id, e);
            }
          }

          verdrahten(feld, R.groesse, function (menge) {
            setzen(id, menge > 0 ? {
              menge: menge,
              bezeichnung: feld.dataset.bezeichnung,
              artikel: feld.dataset.artikel || '',
              artikelName: feld.dataset.artikelName || '',
              sku: feld.dataset.sku || '',
              preis: parseInt(feld.dataset.preis, 10) || 0,
              bild: feld.dataset.bild || ''
            } : null);
            artikelStand(block);
            zeigen();
          });
        })(felder[i]);
      }
      artikelStand(block);
    }

    if (weiter) {
      weiter.addEventListener('click', function (ev) {
        if (weiter.getAttribute('aria-disabled') === 'true') ev.preventDefault();
      });
    }

    var bloecke = wurzel.querySelectorAll('.b2b-vo-produkt');
    for (var b = 0; b < bloecke.length; b++) karte(bloecke[b]);
    sortierung(wurzel);
    suche(wurzel);
    zeigen();

    alleSeitenLaden(wurzel, karte).then(zeigen, zeigen);
  }

  /* Sortiert alle Karten, die beim Wechsel der Auswahl da sind - auch die
     nachgeladenen. Der Rang hält die Katalogreihenfolge fest. */
  function sortierung(wurzel) {
    var wahl = document.querySelector('.b2b-vo-leiste__wahl');
    var liste = wurzel.querySelector('.b2b-vo-liste');
    if (!wahl || !liste) return;

    wahl.addEventListener('change', function () {
      var art = wahl.value;
      var bloecke = Array.prototype.slice.call(liste.querySelectorAll('.b2b-vo-produkt'));
      bloecke.forEach(function (b, i) {
        if (b.dataset.rang === undefined) b.dataset.rang = i;
      });
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

  /* Sucht in Name, Produktart und Artikelnummern aller Karten, auch der
     nachgeladenen. Mehrere Wörter müssen alle vorkommen ("tennis schwarz"). */
  function suche(wurzel) {
    var feld = document.querySelector('[data-vo-suche]');
    var keine = document.querySelector('[data-vo-keine]');
    if (!feld) return;

    feld.addEventListener('input', function () {
      var woerter = feld.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      var bloecke = wurzel.querySelectorAll('.b2b-vo-produkt');
      var treffer = 0;
      for (var i = 0; i < bloecke.length; i++) {
        var text = bloecke[i].dataset.suche || '';
        var passt = woerter.every(function (w) { return text.indexOf(w) > -1; });
        bloecke[i].hidden = !passt;
        if (passt) treffer++;
      }
      if (keine) keine.hidden = treffer > 0;
    });
  }

  /* =====================================================================
     ÜBERSICHT  (/cart)
     ===================================================================== */

  function uebersicht(wurzel) {
    var R = regeln(wurzel);

    var fertig = wurzel.querySelector('[data-vk-fertig]');
    var inhalt = wurzel.querySelector('[data-vk-inhalt]');
    var liste = wurzel.querySelector('[data-vk-liste]');
    var sparen = wurzel.querySelector('[data-vk-sparen]');
    var summen = wurzel.querySelector('[data-vk-summen]');
    var offen = wurzel.querySelector('[data-vk-offen]');
    var formular = wurzel.querySelector('form');
    var knopf = formular && formular.querySelector('[type="submit"]');
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
      var zeilenabzug = Math.floor((zeilenwert * R.satz) / 100);

      li.innerHTML =
        '<span class="b2b-vk-zeile__bild"></span>' +
        '<div class="b2b-vk-zeile__text">' +
          '<p class="b2b-vk-zeile__name"></p>' +
          '<p class="b2b-vk-zeile__sku"></p>' +
          '<p class="b2b-vk-zeile__einzel"><s>' + euro(e.preis) + '</s> ' +
            euro(e.preis - Math.floor((e.preis * R.satz) / 100)) + ' / Pack</p>' +
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

      verdrahten(li.querySelector('[data-vo-zahl]'), R.groesse, function (menge) {
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

    /* Was noch fehlt, bevor die Vororder abgeschickt werden kann. Namen per
       textContent – sie stammen aus dem localStorage. */
    function offenZeigen(a) {
      if (!offen) return;
      offen.hidden = a.ok;
      offen.innerHTML = '';
      if (a.ok) return;
      var titel = document.createElement('p');
      titel.className = 'b2b-vk-offen__titel';
      titel.textContent = 'Damit wir die Vororder annehmen können:';
      offen.appendChild(titel);
      var ul = document.createElement('ul');
      a.zuWenig.forEach(function (art) {
        var li = document.createElement('li');
        li.textContent = art.name + ': ' + art.packs + ' von mindestens ' + R.artikel + ' Packs';
        ul.appendChild(li);
      });
      if (a.fehlt) {
        var li = document.createElement('li');
        li.textContent = 'Bestellwert: noch ' + euro(a.fehlt) + ' bis zum Mindestwert von ' + euro(R.wert) + ' (nach Rabatt)';
        ul.appendChild(li);
      }
      offen.appendChild(ul);
    }

    function zeichnen() {
      var a = auswertung(lesen(), R);
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
        '<div><dt>' + a.anzahlArtikel + ' Artikel' + ' · ' + a.packs.toLocaleString('de-DE') + ' Packs</dt><dd>' + euro(a.wert) + '</dd></div>' +
        '<div><dt>Vororder-Rabatt ' + R.satz + ' %</dt><dd>−' + euro(a.abzug) + '</dd></div>' +
        '<div><dt>Versand</dt><dd>kostenlos</dd></div>' +
        '<div class="b2b-vk-summen__gesamt"><dt>Summe netto</dt><dd>' + euro(a.summe) + '</dd></div>';

      offenZeigen(a);
      if (knopf) {
        knopf.disabled = !a.ok;
        knopf.setAttribute('aria-disabled', a.ok ? 'false' : 'true');
      }
    }

    /* Die Positionsliste entsteht erst beim Absenden. Sie ist Text, weil sie
       in einer E-Mail landet und dort von Hand gelesen wird. */
    if (formular) {
      formular.addEventListener('submit', function (ev) {
        var a = auswertung(lesen(), R);
        if (!a.ok) {
          ev.preventDefault();
          zeichnen();
          return;
        }

        positionenFeld.value = a.posten.map(function (p) {
          var e = p.e;
          return (e.sku ? e.sku + '  ' : '') + e.bezeichnung + '  ' + e.menge + ' Packs  à ' +
            euro(e.preis) + '  = ' + euro(e.menge * e.preis);
        }).join('\n');

        summeFeld.value = a.anzahlArtikel + ' Artikel, ' + a.packs + ' Packs, Listenwert ' + euro(a.wert) +
          ', abzüglich ' + R.satz + ' % (' + euro(a.abzug) + ') = ' + euro(a.summe) + ' netto, versandkostenfrei';
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
