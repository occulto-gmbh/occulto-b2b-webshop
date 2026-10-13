// Filial-Aufteilung im Warenkorb (sections/cart-branch-split.liquid).
//
// Each (variant, branch) pair becomes its own cart line carrying the
// "Lieferfiliale" line property. The 0 € helper "Zusatzpaket Filialversand"
// (275 g = one weight tier = one extra 9,99 € parcel) is kept at exactly
// the number of extra parcels the split causes — the Shopify Function
// extensions/branch-shipping-rule enforces the same formula at checkout,
// so keep expectedExtraParcels() in sync with it.
if (!customElements.get('cart-branch-split')) {
  const BRANCH_PROPERTY = 'Lieferfiliale';
  const SUMMARY_ATTRIBUTE = 'Lieferaufteilung';
  const UNASSIGNED = '__checkout_address__';
  const PACK_STEP = 5;

  customElements.define(
    'cart-branch-split',
    class CartBranchSplit extends HTMLElement {
      connectedCallback() {
        const config = JSON.parse(this.querySelector('[data-branch-split-config]').textContent);
        this.addresses = config.addresses;
        this.strings = config.strings;
        this.surchargeVariantId = Number(this.dataset.surchargeVariantId);
        this.packsPerParcel = Number(this.dataset.packsPerParcel) || 275;
        this.parcelPriceCents = Number(this.dataset.parcelPriceCents) || 999;

        this.branchesEl = this.querySelector('[data-branch-split-branches]');
        this.tableEl = this.querySelector('[data-branch-split-table]');
        this.totalsEl = this.querySelector('[data-branch-split-totals]');
        this.warningEl = this.querySelector('[data-branch-split-warning]');
        this.statusEl = this.querySelector('[data-branch-split-status]');
        this.messageEl = this.querySelector('[data-branch-split-message]');
        this.applyButton = this.querySelector('[data-branch-split-apply]');
        this.resetButton = this.querySelector('[data-branch-split-reset]');

        this.applyButton?.addEventListener('click', () => this.apply());
        this.resetButton?.addEventListener('click', () => this.reset());

        this.load();
        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, () => this.load());
        }
      }

      disconnectedCallback() {
        this.unsubscribe?.();
      }

      async load() {
        try {
          this.cart = await this.request('cart.js');
        } catch (error) {
          return;
        }
        this.buildState();
        this.render();
        await this.syncSurcharge();
      }

      isSurcharge(item) {
        return item.variant_id === this.surchargeVariantId;
      }

      // Rows = one per variant, with its quantity per branch label.
      buildState() {
        const rows = new Map();
        const usedLabels = new Set();

        this.cart.items.forEach((item) => {
          if (this.isSurcharge(item)) return;
          const { [BRANCH_PROPERTY]: branch, ...otherProperties } = item.properties || {};

          if (!rows.has(item.variant_id)) {
            rows.set(item.variant_id, {
              variantId: item.variant_id,
              title: item.variant_title ? `${item.product_title} – ${item.variant_title}` : item.product_title,
              properties: otherProperties,
              before: 0,
              unassigned: 0,
              allocation: new Map(),
            });
          }
          const row = rows.get(item.variant_id);
          row.before += item.quantity;
          if (branch) {
            usedLabels.add(branch);
            row.allocation.set(branch, (row.allocation.get(branch) || 0) + item.quantity);
          } else {
            row.unassigned += item.quantity;
          }
        });

        this.rows = [...rows.values()];

        // Branches = saved account addresses, plus any label already in the
        // cart that no longer matches one (e.g. address edited since).
        this.branches = this.addresses.map((address) => ({ label: address.label, short: address.short }));
        usedLabels.forEach((label) => {
          if (!this.branches.some((branch) => branch.label === label)) {
            this.branches.push({ label, short: label });
          }
        });
        this.selected = new Set(usedLabels);
        this.isSplit = usedLabels.size > 0;

        // Products added after a split have no branch yet: suggest the
        // first branch, so applying again assigns them instead of silently
        // shipping them to the checkout address as an extra shipment.
        const firstBranch = this.branches.find((branch) => this.selected.has(branch.label))?.label;
        this.hasUnassigned = Boolean(firstBranch) && this.rows.some((row) => row.unassigned > 0);
        if (firstBranch) {
          this.rows.forEach((row) => {
            if (row.unassigned === 0) return;
            row.allocation.set(firstBranch, (row.allocation.get(firstBranch) || 0) + row.unassigned);
            row.unassigned = 0;
          });
        }
      }

      render() {
        const surchargeQuantity = this.surchargeQuantity();
        this.statusEl.textContent = this.isSplit
          ? this.strings.active.replace('[count]', this.selected.size).replace('[parcels]', surchargeQuantity)
          : '';
        if (this.resetButton) this.resetButton.hidden = !this.isSplit;
        if (this.hasUnassigned) {
          this.showMessage(this.strings.unassigned);
          this.querySelector('[data-branch-split-details]')?.setAttribute('open', '');
        }
        if (!this.branchesEl) return;

        this.branchesEl.replaceChildren(
          ...this.branches.map((branch) => {
            const label = document.createElement('label');
            label.className = 'cart-branch-split__branch';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.selected.has(branch.label);
            checkbox.addEventListener('change', () => this.toggleBranch(branch.label, checkbox.checked));
            const text = document.createElement('span');
            text.textContent = branch.label;
            label.append(checkbox, text);
            return label;
          })
        );
        this.renderTable();
      }

      toggleBranch(label, checked) {
        const firstSelected = () => this.branches.find((branch) => this.selected.has(branch.label))?.label;

        if (checked) {
          this.selected.add(label);
        } else {
          this.selected.delete(label);
        }

        // Never lose quantities: a deselected branch's packs move to the
        // first remaining branch, unassigned packs go to the first branch.
        this.rows.forEach((row) => {
          if (!checked && row.allocation.has(label)) {
            const quantity = row.allocation.get(label);
            row.allocation.delete(label);
            const target = firstSelected();
            if (target) {
              row.allocation.set(target, (row.allocation.get(target) || 0) + quantity);
            } else {
              row.unassigned += quantity;
            }
          }
          const target = firstSelected();
          if (target && row.unassigned > 0) {
            row.allocation.set(target, (row.allocation.get(target) || 0) + row.unassigned);
            row.unassigned = 0;
          }
        });

        this.renderTable();
      }

      selectedBranches() {
        return this.branches.filter((branch) => this.selected.has(branch.label));
      }

      renderTable() {
        const branches = this.selectedBranches();
        this.tableEl.replaceChildren();
        if (branches.length === 0) {
          this.totalsEl.textContent = '';
          this.warningEl.hidden = true;
          return;
        }

        const table = document.createElement('table');
        table.className = 'cart-branch-split__table';
        const headRow = table.createTHead().insertRow();
        [this.strings.article, ...branches.map((branch) => branch.short), this.strings.total].forEach((text) => {
          const th = document.createElement('th');
          th.scope = 'col';
          th.textContent = text;
          headRow.append(th);
        });

        const body = table.createTBody();
        this.rows.forEach((row) => {
          const tr = body.insertRow();
          const titleCell = tr.insertCell();
          titleCell.textContent = row.title;
          const before = document.createElement('small');
          before.textContent = this.strings.before.replace('[count]', row.before);
          titleCell.append(document.createElement('br'), before);

          const totalCell = document.createElement('td');
          branches.forEach((branch) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = String(PACK_STEP);
            input.inputMode = 'numeric';
            input.className = 'cart-branch-split__input';
            input.value = row.allocation.get(branch.label) || 0;
            input.setAttribute('aria-label', `${row.title} – ${branch.label}`);
            input.addEventListener('input', () => {
              const value = Math.max(0, Math.floor(Number(input.value) || 0));
              row.allocation.set(branch.label, value);
              input.classList.toggle('cart-branch-split__input--invalid', value % PACK_STEP !== 0);
              this.updateTotals();
            });
            input.classList.toggle('cart-branch-split__input--invalid', Number(input.value) % PACK_STEP !== 0);
            tr.insertCell().append(input);
          });
          totalCell.dataset.rowTotal = row.variantId;
          tr.append(totalCell);
        });

        this.tableEl.append(table);
        this.updateTotals();
      }

      packsPerBranch() {
        const packs = new Map();
        this.rows.forEach((row) => {
          this.selected.forEach((label) => {
            const quantity = row.allocation.get(label) || 0;
            if (quantity > 0) packs.set(label, (packs.get(label) || 0) + quantity);
          });
          if (row.unassigned > 0) packs.set(UNASSIGNED, (packs.get(UNASSIGNED) || 0) + row.unassigned);
        });
        return packs;
      }

      updateTotals() {
        this.rows.forEach((row) => {
          const cell = this.tableEl.querySelector(`[data-row-total="${row.variantId}"]`);
          if (cell) cell.textContent = [...this.selected].reduce((sum, label) => sum + (row.allocation.get(label) || 0), 0);
        });

        const packs = this.packsPerBranch();
        const perBranch = this.selectedBranches()
          .filter((branch) => packs.get(branch.label))
          .map((branch) => {
            const count = packs.get(branch.label);
            return `${branch.short}: ${count} ${this.strings.packs} / ${Math.ceil(count / this.packsPerParcel)} ${this.strings.parcels}`;
          });
        const extra = this.expectedExtraParcels([...packs.values()]);
        perBranch.push(
          this.strings.extraParcels
            .replace('[count]', extra)
            .replace('[amount]', this.formatMoney(extra * this.parcelPriceCents))
        );
        this.totalsEl.textContent = perBranch.join(' · ');

        const hasInvalid = this.rows.some((row) =>
          [...this.selected].some((label) => (row.allocation.get(label) || 0) % PACK_STEP !== 0)
        );
        this.warningEl.hidden = !hasInvalid;
        this.warningEl.textContent = hasInvalid ? this.strings.packWarning : '';
      }

      // Same formula as extensions/branch-shipping-rule.
      expectedExtraParcels(packsPerBranch) {
        const branches = packsPerBranch.filter((packs) => packs > 0);
        if (branches.length < 2) return 0;
        const parcels = (packs) => Math.ceil(packs / this.packsPerParcel);
        const separate = branches.reduce((sum, packs) => sum + parcels(packs), 0);
        const combined = parcels(branches.reduce((sum, packs) => sum + packs, 0));
        return separate - combined;
      }

      expectedExtraParcelsForCart(cart) {
        const packs = new Map();
        cart.items.forEach((item) => {
          if (this.isSurcharge(item) || !item.requires_shipping) return;
          const branch = item.properties?.[BRANCH_PROPERTY] || UNASSIGNED;
          packs.set(branch, (packs.get(branch) || 0) + item.quantity);
        });
        return this.expectedExtraParcels([...packs.values()]);
      }

      surchargeQuantity(cart = this.cart) {
        return cart.items.filter((item) => this.isSurcharge(item)).reduce((sum, item) => sum + item.quantity, 0);
      }

      // Order-level overview for the warehouse ("Lieferaufteilung" cart
      // attribute), always derived from the actual cart lines.
      summaryForCart(cart) {
        const packs = new Map();
        cart.items.forEach((item) => {
          if (this.isSurcharge(item) || !item.requires_shipping) return;
          const branch = item.properties?.[BRANCH_PROPERTY] || UNASSIGNED;
          packs.set(branch, (packs.get(branch) || 0) + item.quantity);
        });
        if (![...packs.keys()].some((branch) => branch !== UNASSIGNED)) return '';
        return [...packs.entries()]
          .map(([branch, count]) => {
            const label = branch === UNASSIGNED ? 'Lieferadresse aus dem Checkout' : branch;
            return `${label}: ${count} Packs, ${Math.ceil(count / this.packsPerParcel)} Paket(e)`;
          })
          .join('\n');
      }

      // Keeps the helper line right after any cart change (quantity edits,
      // removed lines, new products). Reloads only once the cart is verified
      // correct, so a failing request can't cause a reload loop.
      async syncSurcharge() {
        const expected = this.expectedExtraParcelsForCart(this.cart);
        if (this.surchargeQuantity() === expected) {
          const summary = this.summaryForCart(this.cart);
          if ((this.cart.attributes?.[SUMMARY_ATTRIBUTE] || '') !== summary) {
            await this.request('cart/update.js', { attributes: { [SUMMARY_ATTRIBUTE]: summary } }).catch(() => {});
          }
          return;
        }

        try {
          const updates = {};
          const surchargeLines = this.cart.items.filter((item) => this.isSurcharge(item));
          surchargeLines.forEach((item, index) => {
            updates[item.key] = index === 0 ? expected : 0;
          });
          if (Object.keys(updates).length) {
            await this.request('cart/update.js', { updates });
          }
          if (surchargeLines.length === 0 && expected > 0) {
            await this.request('cart/add.js', { items: [{ id: this.surchargeVariantId, quantity: expected }] });
          }
          const cart = await this.request('cart/update.js', {
            attributes: { [SUMMARY_ATTRIBUTE]: this.summaryForCart(this.cart) },
          });
          if (this.surchargeQuantity(cart) === this.expectedExtraParcelsForCart(cart)) {
            window.location.reload();
          } else {
            this.showMessage(this.strings.error);
          }
        } catch (error) {
          this.showMessage(this.strings.error);
        }
      }

      async apply() {
        if (this.selected.size === 0) {
          this.showMessage(this.strings.minBranches);
          return;
        }
        const items = [];
        this.rows.forEach((row) => {
          this.selected.forEach((label) => {
            const quantity = row.allocation.get(label) || 0;
            if (quantity > 0) {
              items.push({ id: row.variantId, quantity, properties: { ...row.properties, [BRANCH_PROPERTY]: label } });
            }
          });
          if (row.unassigned > 0) {
            items.push({ id: row.variantId, quantity: row.unassigned, properties: row.properties });
          }
        });

        await this.replaceCart(items, this.expectedExtraParcels([...this.packsPerBranch().values()]));
      }

      async reset() {
        const items = this.rows.map((row) => ({
          id: row.variantId,
          quantity: row.before,
          properties: row.properties,
        }));
        await this.replaceCart(items, 0);
      }

      // Removes all product lines and re-adds them in their new split. The
      // Cart AJAX API has no atomic "replace", so on failure the previous
      // lines are restored.
      async replaceCart(items, extraParcels) {
        this.setBusy(true);
        this.showMessage(this.strings.saving);
        const newItems = items.filter((item) => item.quantity > 0);
        if (extraParcels > 0) newItems.push({ id: this.surchargeVariantId, quantity: extraParcels });

        try {
          // Fresh cart, so no line (e.g. a just-synced helper line) is missed.
          const current = await this.request('cart.js');
          const previous = current.items.map((item) => ({
            id: item.variant_id,
            quantity: item.quantity,
            properties: item.properties,
          }));
          const updates = {};
          current.items.forEach((item) => {
            updates[item.key] = 0;
          });

          await this.request('cart/update.js', { updates });
          try {
            await this.request('cart/add.js', { items: newItems });
          } catch (error) {
            await this.request('cart/add.js', { items: previous }).catch(() => {});
            throw error;
          }
          const cart = await this.request('cart.js');
          await this.request('cart/update.js', { attributes: { [SUMMARY_ATTRIBUTE]: this.summaryForCart(cart) } });
          window.location.reload();
        } catch (error) {
          this.setBusy(false);
          this.showMessage(this.strings.error);
        }
      }

      setBusy(busy) {
        [this.applyButton, this.resetButton].forEach((button) => {
          if (button) button.disabled = busy;
        });
      }

      showMessage(text) {
        this.messageEl.textContent = text;
      }

      formatMoney(cents) {
        return new Intl.NumberFormat(document.documentElement.lang || 'de', {
          style: 'currency',
          currency: this.cart?.currency || 'EUR',
        }).format(cents / 100);
      }

      async request(path, body) {
        const root = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${root}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) throw new Error(`Cart request failed: ${response.status}`);
        return response.json();
      }
    }
  );
}
