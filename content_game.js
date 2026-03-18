const slug = location.pathname.split('/')[2]; // /game/{slug}/info/
const LOADED_ID = 'itad-loaded-row';

function makeCell(classes, content) {
  const div = document.createElement('div');
  div.className = classes;
  if (typeof content === 'string') {
    div.textContent = content;
  } else if (content) {
    div.appendChild(content);
  }
  return div;
}

function injectLoadedRow() {
  if (document.getElementById(LOADED_ID)) return;
  const existingRow = document.querySelector('a.row[class*="svelte"]');
  if (!existingRow) return;
  const container = existingRow.parentElement;

  const svelte = getHashClass(existingRow);

  // Build row matching ITAD's structure exactly
  const row = document.createElement('a');
  row.id = LOADED_ID;
  row.href = `https://www.loaded.com/${slug}-pc-steam`;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';
  row.className = existingRow.className; // inherit Svelte styles

  // .cell--shop
  const shopBadge = document.createElement('span');
  shopBadge.className = 'loaded-badge';
  shopBadge.textContent = 'Loaded';
  row.appendChild(makeCell(`cell cell--shop ${svelte['cell--shop']}`, shopBadge));

  // .cell--platforms — use same SVG as ITAD
  const platformSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  platformSvg.setAttribute('aria-hidden', 'true');
  platformSvg.setAttribute('focusable', 'false');
  platformSvg.setAttribute('role', 'presentation');
  platformSvg.setAttribute('class', 'svg-inline--fa fa-fw');
  platformSvg.setAttribute('viewBox', '0 0 448 512');
  const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  useEl.setAttribute('href', '#i-windows');
  platformSvg.appendChild(useEl);
  row.appendChild(makeCell(`cell cell--platforms ${svelte['cell--platforms']}`, platformSvg));

  // .cell--low
  row.appendChild(makeCell(`cell cell--low ${svelte['cell--low']}`, '—'));

  // .cell--cut
  const cutCell = makeCell(`cell cell--cut ${svelte['cell--cut']}`, '—');
  cutCell.id = 'loaded-cut-cell';
  row.appendChild(cutCell);

  // .cell--price (placeholder)
  const priceCell = makeCell(`cell cell--price ${svelte['cell--price']}`);
  priceCell.id = 'loaded-price-cell';
  const loadingSpan = document.createElement('span');
  loadingSpan.className = 'loaded-loading';
  loadingSpan.textContent = 'Loading…';
  priceCell.appendChild(loadingSpan);
  row.appendChild(priceCell);

  container.appendChild(row);

  console.log('[Loaded] Sending message for slug:', slug);
  chrome.runtime.sendMessage({ type: 'FETCH_LOADED', slug }, (res) => {
    console.log('[Loaded] Got response:', res);
    const cell = document.getElementById('loaded-price-cell');
    if (!cell) return;
    cell.textContent = ''; // clear placeholder
    if (!res || !res.available) {
      const naSpan = document.createElement('span');
      naSpan.className = 'loaded-na';
      naSpan.textContent = 'Not listed';
      cell.appendChild(naSpan);
      return;
    }
    if (!res.inStock) {
      const soldOutSpan = document.createElement('span');
      soldOutSpan.className = 'loaded-sold-out';
      soldOutSpan.textContent = 'Sold Out';
      cell.appendChild(soldOutSpan);
      document.getElementById(LOADED_ID).href = res.url;
      return;
    }
    const priceSpan = document.createElement('span');
    priceSpan.className = 'loaded-price';
    priceSpan.textContent = `$${res.price}`;
    cell.appendChild(priceSpan);
    if (res.oldPrice) {
      const oldSpan = document.createElement('span');
      oldSpan.className = 'loaded-old-price';
      oldSpan.textContent = res.oldPrice;
      cell.appendChild(oldSpan);
    }
    // Compare loaded price against best price already on the page
    const otherPrices = [...document.querySelectorAll(`a.row[class*="svelte"]:not(#${LOADED_ID}) .cell--price`)]
      .map(c => { const m = c.textContent.match(/[\d,]+\.?\d*/); return m ? parseFloat(m[0].replace(',', '')) : null; })
      .filter(p => p !== null && p > 0);
    const bestPrice = otherPrices.length ? Math.min(...otherPrices) : null;
    const loadedPrice = parseFloat(res.price);
    if (bestPrice && loadedPrice < bestPrice) {
      const pct = Math.round((1 - loadedPrice / bestPrice) * 100);
      const cutCell = document.getElementById('loaded-cut-cell');
      if (cutCell && pct > 0) cutCell.textContent = `-${pct}%`;
    }
    // Update the row href with the real URL
    document.getElementById(LOADED_ID).href = res.url;
  });
}

// Extract svelte hash classes from an existing row's cells
function getHashClass(row) {
  const result = {};
  for (const cls of ['cell--shop', 'cell--platforms', 'cell--low', 'cell--cut', 'cell--price']) {
    const cell = row.querySelector(`.${cls}`);
    result[cls] = cell
      ? ([...cell.classList].find(c => c.startsWith('svelte-')) ?? '')
      : '';
  }
  return result;
}

console.log('[Loaded] content_game.js loaded, slug:', slug);
// MutationObserver: wait for Svelte to render the prices section
const observer = new MutationObserver(() => {
  if (document.querySelector('section.prices a.row')) {
    injectLoadedRow();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
// Also try immediately in case already rendered
injectLoadedRow();
