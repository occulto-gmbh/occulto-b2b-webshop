// Händler-Downloads (sections/dealer-downloads.liquid): builds the product
// master data (Excel/CSV, one row per size) and an image ZIP in the browser
// from the live shop data. Libraries are loaded only when a download starts.
if (!customElements.get('dealer-downloads')) {
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  const COLUMNS = [
    'Artikelnummer',
    'Farb-Artikelnummer',
    'Modellnummer',
    'Produktname',
    'Kategorie',
    'Farbcode',
    'Größe',
    'EAN',
    'Material',
    'Herkunftsland',
    'Pflegehinweise',
    'Händlerpreis netto (EUR)',
    'UVP netto (EUR)',
    'UVP brutto (EUR)',
    'Bestellschritt (Packs)',
    'Verfügbar (Packs)',
    'Beschreibung',
    'Bilddateien',
    'Produktlink',
  ];

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(script);
    });

  customElements.define(
    'dealer-downloads',
    class DealerDownloads extends HTMLElement {
      connectedCallback() {
        this.statusEl = this.querySelector('[data-download-status]');
        this.querySelectorAll('[data-download]').forEach((button) =>
          button.addEventListener('click', () => this.run(button.dataset.download, button))
        );
        this.loadProducts().then((products) => {
          const images = products.reduce((sum, product) => sum + product.images.length, 0);
          const meta = this.querySelector('[data-download-images-meta]');
          if (meta) meta.textContent = `${images} Bilder von ${products.length} Artikeln.`;
        });
      }

      // All pages of the section's embedded JSON (250 products per page).
      loadProducts() {
        if (this.productsPromise) return this.productsPromise;
        this.productsPromise = (async () => {
          let data = JSON.parse(document.querySelector('[data-dealer-downloads-data]').textContent);
          const products = [...data.products];
          while (data.nextPage) {
            const url = `${window.location.pathname}?page=${data.nextPage}&section_id=${this.dataset.sectionId}`;
            const html = await fetch(url).then((response) => response.text());
            const script = new DOMParser()
              .parseFromString(html, 'text/html')
              .querySelector('[data-dealer-downloads-data]');
            data = JSON.parse(script.textContent);
            products.push(...data.products);
          }
          return products;
        })();
        return this.productsPromise;
      }

      // Colour-level article number = SKU without the size suffix
      // (11001-006-35-38 -> 11001-006; 31002-001 stays as is).
      colorNumber(product) {
        const variant = product.variants[0];
        if (!variant?.sku) return '';
        const suffix = `-${variant.size}`;
        return variant.sku.endsWith(suffix) ? variant.sku.slice(0, -suffix.length) : variant.sku;
      }

      // File names for a product's images, unique across the whole export.
      imageNames(products) {
        const used = new Map();
        return new Map(
          products.map((product) => {
            let base = this.colorNumber(product) || product.title.replace(/[^\w-]+/g, '_');
            const count = used.get(base) || 0;
            used.set(base, count + 1);
            if (count > 0) base = `${base}-${count + 1}`;
            const names = product.images.map((url, index) => {
              const extension = (url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [, 'jpg'])[1].toLowerCase();
              return `${base}${index === 0 ? '' : `_${index + 1}`}.${extension}`;
            });
            return [product, names];
          })
        );
      }

      rows(products) {
        const vat = 1 + (Number(this.dataset.vatRate) || 19) / 100;
        const names = this.imageNames(products);
        const money = (cents) => (cents ? Math.round(cents) / 100 : '');
        return products.flatMap((product) => {
          const colorNumber = this.colorNumber(product);
          const [model, colorCode] = colorNumber.split('-');
          return product.variants.map((variant) => [
            variant.sku,
            colorNumber,
            model || '',
            product.title,
            product.categories.join(', '),
            colorCode && /^\d+$/.test(colorCode) ? colorCode : '',
            variant.size === 'Default Title' ? 'One Size' : variant.size,
            variant.ean,
            product.material.replace(/\s*\|\s*/g, ', '),
            // A value from the product (e.g. synced from JTL) wins over the default.
            product.origin || this.dataset.defaultOrigin || '',
            this.dataset.care,
            money(variant.price),
            money(variant.uvp),
            variant.uvp ? this.grossUvp(variant.uvp, vat) : '',
            Number(this.dataset.packStep) || 5,
            variant.stock ?? '',
            product.description,
            names.get(product).join(', '),
            product.url,
          ]);
        });
      }

      // JTL stores the UVP net, already rounded from the gross price
      // (7,99 € / 1,19 = 6,71 €), so net × 1,19 can land a cent off (7,98 €).
      // Pick the gross cent value that rounds back to the stored net value,
      // preferring the usual ,x9 price ending.
      grossUvp(netCents, vat) {
        const guess = Math.round(netCents * vat);
        const candidates = [guess - 1, guess, guess + 1].filter((cents) => Math.round(cents / vat) === netCents);
        const best = candidates.find((cents) => cents % 10 === 9) ?? candidates[0] ?? guess;
        return best / 100;
      }

      fileName(extension) {
        return `Occulto_Produktstammdaten_${new Date().toISOString().slice(0, 10)}.${extension}`;
      }

      async run(type, button) {
        const buttons = this.querySelectorAll('[data-download]');
        buttons.forEach((b) => (b.disabled = true));
        try {
          const products = await this.loadProducts();
          if (type === 'csv') this.downloadCsv(products);
          if (type === 'xlsx') await this.downloadXlsx(products);
          if (type === 'zip') await this.downloadZip(products);
        } catch (error) {
          console.error(error);
          this.setStatus('Der Download ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es erneut.');
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      }

      // German Excel opens semicolon CSV with decimal commas directly.
      downloadCsv(products) {
        const cell = (value) => {
          const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
          return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const lines = [COLUMNS, ...this.rows(products)].map((row) => row.map(cell).join(';'));
        this.save(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), this.fileName('csv'));
        this.setStatus(`CSV mit ${lines.length - 1} Artikeln erstellt.`);
      }

      async downloadXlsx(products) {
        this.setStatus('Excel-Datei wird erstellt …');
        await loadScript(XLSX_URL);
        const rows = this.rows(products);
        const sheet = window.XLSX.utils.aoa_to_sheet([COLUMNS, ...rows]);
        sheet['!cols'] = COLUMNS.map((name) => ({ wch: name === 'Beschreibung' ? 60 : Math.max(12, name.length + 2) }));
        sheet['!autofilter'] = { ref: sheet['!ref'] };
        const book = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(book, sheet, 'Produktstammdaten');
        window.XLSX.writeFile(book, this.fileName('xlsx'));
        this.setStatus(`Excel mit ${rows.length} Artikeln erstellt.`);
      }

      async downloadZip(products) {
        this.setStatus('Bilder werden geladen …');
        await loadScript(JSZIP_URL);
        const zip = new window.JSZip();
        const names = this.imageNames(products);
        const jobs = products.flatMap((product) =>
          product.images.map((url, index) => ({ url, name: names.get(product)[index] }))
        );
        let done = 0;
        let failed = 0;
        const worker = async () => {
          while (jobs.length) {
            const job = jobs.shift();
            try {
              const response = await fetch(job.url);
              if (!response.ok) throw new Error(response.status);
              zip.file(job.name, await response.blob());
            } catch (error) {
              failed += 1;
            }
            done += 1;
            this.setStatus(`Bilder werden geladen … ${done} von ${done + jobs.length}`);
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        this.setStatus('ZIP wird erstellt …');
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        this.save(blob, `Occulto_Produktbilder_${new Date().toISOString().slice(0, 10)}.zip`);
        this.setStatus(
          failed
            ? `ZIP mit ${done - failed} Bildern erstellt (${failed} Bilder konnten nicht geladen werden).`
            : `ZIP mit ${done} Bildern erstellt.`
        );
      }

      save(blob, name) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      }

      setStatus(text) {
        this.statusEl.textContent = text;
      }
    }
  );
}
