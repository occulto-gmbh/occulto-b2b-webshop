/* Alle Sammlungseiten in Bestseller-Reihenfolge; Filter bleiben bei Shopify. */
if (!customElements.get('b2b-katalog')) {
  customElements.define('b2b-katalog', class extends HTMLElement {
    static suchen = new Map();

    connectedCallback() {
      this.abbruch = new AbortController();
      this.feld = this.querySelector('[data-katalog-suche]');
      this.status = this.querySelector('[data-katalog-status]');
      this.grid = this.querySelector('#product-grid');
      if (!this.feld || !this.grid) return;
      this.feld.value = this.constructor.suchen.get(this.dataset.abschnitt) || '';
      this.feld.addEventListener('input', () => {
        this.constructor.suchen.set(this.dataset.abschnitt, this.feld.value);
        this.filtern();
      });
      this.filtern();
      this.laden();
    }

    disconnectedCallback() {
      this.abbruch?.abort();
    }

    karten() {
      return Array.from(this.grid.querySelectorAll(':scope > [data-produkt]'));
    }

    filtern() {
      const woerter = this.feld.value.trim().toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
      let treffer = 0;
      this.karten().forEach((karte) => {
        const text = (karte.dataset.suche || '').toLocaleLowerCase('de');
        karte.hidden = !woerter.every((wort) => text.includes(wort));
        if (!karte.hidden) treffer++;
      });
      this.status.textContent = treffer + (treffer === 1 ? ' Produkt' : ' Produkte') +
        (this.laedt ? ' · Sortiment wird geladen …' : '') +
        (this.fehler ? ' · Weitere Produkte erreichst du über die Seitennavigation.' : '');
    }

    sortieren() {
      const karten = this.karten();
      karten.sort((a, b) =>
        Number(b.dataset.verfuegbar === 'true') - Number(a.dataset.verfuegbar === 'true') ||
        Number(a.dataset.rang) - Number(b.dataset.rang));
      karten.forEach((karte) => {
        // Nachgeladene Karten stehen bereits im Sichtbereich.
        karte.classList.remove('scroll-trigger', 'animate--slide-in');
        this.grid.appendChild(karte);
      });
      this.filtern();
    }

    async seite(nummer) {
      const url = new URL(location.href);
      url.searchParams.set('sort_by', 'best-selling');
      url.searchParams.set('page', nummer);
      url.searchParams.set('section_id', this.dataset.abschnitt);
      const antwort = await fetch(url, { signal: this.abbruch.signal, credentials: 'same-origin' });
      if (!antwort.ok) throw new Error('Sortiment nicht geladen');
      const doc = new DOMParser().parseFromString(await antwort.text(), 'text/html');
      const katalog = doc.querySelector('b2b-katalog');
      if (!katalog || !katalog.querySelector('#product-grid')) throw new Error('Sortiment fehlt');
      return katalog;
    }

    uebernehmen(katalog) {
      const vorhanden = new Set(this.karten().map((karte) => karte.dataset.produkt));
      katalog.querySelectorAll('#product-grid > [data-produkt]').forEach((karte) => {
        if (!vorhanden.has(karte.dataset.produkt)) this.grid.appendChild(document.importNode(karte, true));
      });
    }

    async laden() {
      this.laedt = true;
      this.filtern();
      try {
        let seiten = Number(this.dataset.seiten) || 1;
        let aktuell = Number(this.dataset.seite) || 1;
        if (this.dataset.sortierung !== 'best-selling') {
          const erste = await this.seite(1);
          if (!this.isConnected) return;
          seiten = Number(erste.dataset.seiten) || 1;
          aktuell = 1;
          this.grid.replaceChildren();
          this.uebernehmen(erste);
        }
        this.sortieren();
        for (let seite = 1; seite <= seiten; seite++) {
          if (seite === aktuell) continue;
          const teil = await this.seite(seite);
          if (!this.isConnected) return;
          this.uebernehmen(teil);
          this.sortieren();
        }
        this.querySelectorAll('.pagination-wrapper').forEach((el) => el.remove());
      } catch (fehler) {
        if (fehler.name === 'AbortError') return;
        this.fehler = true;
      } finally {
        this.laedt = false;
        if (this.isConnected) this.filtern();
      }
    }
  });
}

