// Fetch USD->ILS rate once and reuse for every badge.
const ratePromise = new Promise((resolve) => {
  chrome.runtime.sendMessage({ type: 'GET_RATE' }, (res) => resolve(res?.rate ?? null));
});

function normalizeCurrency(currency) {
  const code = String(currency ?? 'USD').toUpperCase();
  return code === 'NIS' ? 'ILS' : code;
}

// Loaded can return a localized price. Normalize it before comparing against
// ITAD's USD prices, while retaining the actual ILS amount for display.
function normalizePrice(res, rate) {
  const amount = Number.parseFloat(res.price);
  const currency = normalizeCurrency(res.currency);
  if (!Number.isFinite(amount)) return { currency, usd: null, ils: null };

  const validRate = Number.isFinite(rate) && rate > 0;
  if (currency === 'ILS') {
    return { currency, usd: validRate ? amount / rate : null, ils: amount };
  }
  return { currency, usd: amount, ils: validRate ? amount * rate : null };
}

function processItems() {
  const items = document.querySelectorAll('.item[class*="svelte"]:not([data-loaded-injected])');
  console.log('[Loaded] processItems found:', items.length);
  items.forEach(item => {
    item.setAttribute('data-loaded-injected', 'true');
    const bannerLink = item.querySelector('a[href*="/game/"]');
    if (!bannerLink) { console.log('[Loaded] no bannerLink', item.className); return; }
    const match = bannerLink.href.match(/\/game\/([^/]+)\//);
    if (!match) { console.log('[Loaded] no slug match', bannerLink.href); return; }
    const slug = match[1];
    // Released games have an ITAD price element; unreleased ones don't.
    const priceEl = item.querySelector('a[class*="price"][class*="svelte"]');
    const released = !!priceEl;

    // One wrapper grid child containing a cut chip + price badge side by side.
    const wrapper = document.createElement('div');
    wrapper.className = 'loaded-waitlist-wrapper';
    const cutChip = document.createElement('span');
    cutChip.className = 'loaded-cut-chip';
    const badge = document.createElement('a');
    badge.className = 'loaded-waitlist-badge';
    badge.href = `https://www.loaded.com/${slug}-pc-steam`;
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
    badge.textContent = '…';
    badge.title = 'Checking Loaded.com price…';
    const nisChip = document.createElement('span');
    nisChip.className = 'loaded-waitlist-nis';
    const priceCol = document.createElement('span');
    priceCol.className = 'loaded-waitlist-pricecol';
    priceCol.appendChild(badge);
    priceCol.appendChild(nisChip);
    wrapper.appendChild(priceCol);
    wrapper.appendChild(cutChip);
    const firstAction = item.querySelector('button.action');
    item.insertBefore(wrapper, firstAction ?? null);
    // Only released rows have the price-grid columns to widen; leave the
    // unreleased rows' layout untouched so the badge just tucks in at the end.
    if (released) {
      item.style.gridTemplateColumns = '62px 127px 636px 200px 140px 45px 45px';
    } else {
      // Unreleased rows lack the price grid-columns, so the badge would land
      // in the wrong cell. Pin the wrapper absolutely, aligned to the same
      // column as the released rows' badges (tunable via --loaded-badge-right).
      badge.classList.add('loaded-unreleased');
      wrapper.classList.add('loaded-waitlist-wrapper--pinned');
      item.style.position = 'relative';
    }
    chrome.runtime.sendMessage({ type: 'FETCH_LOADED', slug }, (res) => {
      if (!res || !res.available) {
        // Unreleased + not on Loaded → quiet "soon" marker, not a loud N/A.
        badge.textContent = released ? 'N/A' : 'soon';
        badge.classList.add(released ? 'loaded-na' : 'loaded-soon');
        badge.title = released
          ? 'Not listed on Loaded.com'
          : 'Not yet on Loaded.com — released games will show a price here';
        return;
      }
      badge.href = res.url;
      if (!res.inStock) {
        badge.textContent = released ? 'Sold Out' : 'Preorder';
        badge.classList.add(released ? 'loaded-sold-out-badge' : 'loaded-preorder');
        badge.title = 'Available on Loaded.com';
        return;
      }
      ratePromise.then((rate) => {
        const price = normalizePrice(res, rate);
        if (price.usd === null && price.ils === null) {
          badge.textContent = 'N/A';
          badge.classList.add('loaded-na');
          badge.title = 'Loaded.com returned an invalid price';
          return;
        }

        // Keep USD as the primary amount for consistency with ITAD. If Loaded
        // returned ILS, convert it to USD for display/comparison and show the
        // original ILS amount underneath instead of converting it a second time.
        const primary = price.usd !== null
          ? `$${price.usd.toFixed(2)}`
          : `₪${price.ils.toFixed(2)}`;
        if (price.ils !== null) nisChip.textContent = `₪${price.ils.toFixed(2)}`;

        // Compare with ITAD best price only after normalizing to USD.
        const itadPriceText = priceEl?.querySelector('[class*="price"]')?.textContent?.trim();
        const itadUSD = parseFloat(itadPriceText?.replace(/[^0-9.]/g, ''));
        if (price.usd !== null && !isNaN(itadUSD) && price.usd < itadUSD) {
          const pct = Math.round((1 - price.usd / itadUSD) * 100);
          badge.classList.add('loaded-cheaper');
          badge.textContent = `↓ ${primary}`;
          badge.title = `Loaded.com is cheaper: ${primary} vs $${itadUSD.toFixed(2)} on ITAD`;
          cutChip.textContent = `-${pct}%`;
          cutChip.classList.add('loaded-cut-chip--visible');
        } else {
          badge.classList.add('loaded-pricier');
          badge.textContent = primary;
          badge.title = `Loaded.com: ${primary}`;
        }
      });
    });
  });
}

// MutationObserver to handle initial render + sort/filter re-renders.
// Debounced so a burst of mutations triggers at most one processItems pass.
// processItems is idempotent (data-loaded-injected guard), so the observer
// stays connected to catch re-renders.
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    processItems();
  }, 100);
});
observer.observe(document.body, { childList: true, subtree: true });
console.log('[Loaded] content_waitlist.js loaded');
processItems();
