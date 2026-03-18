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
    const priceEl = item.querySelector('a[class*="price"][class*="svelte"]');
    if (!priceEl) { console.log('[Loaded] no priceEl for slug:', slug); return; }
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
    wrapper.appendChild(badge);
    wrapper.appendChild(cutChip);
    const firstAction = item.querySelector('button.action');
    item.insertBefore(wrapper, firstAction ?? null);
    item.style.gridTemplateColumns = '62px 127px 636px 200px 140px 45px 45px';
    chrome.runtime.sendMessage({ type: 'FETCH_LOADED', slug }, (res) => {
      if (!res || !res.available) {
        badge.textContent = 'N/A';
        badge.classList.add('loaded-na');
        return;
      }
      badge.href = res.url;
      if (!res.inStock) {
        badge.textContent = 'Sold Out';
        badge.classList.add('loaded-sold-out-badge');
        return;
      }
      const priceUSD = parseFloat(res.price);
      // Compare with ITAD best price
      const itadPriceText = priceEl.querySelector('[class*="price"]')?.textContent?.trim();
      const itadUSD = parseFloat(itadPriceText?.replace(/[^0-9.]/g, ''));
      if (!isNaN(itadUSD) && priceUSD < itadUSD) {
        const pct = Math.round((1 - priceUSD / itadUSD) * 100);
        badge.classList.add('loaded-cheaper');
        badge.textContent = `↓ $${priceUSD.toFixed(2)}`;
        badge.title = `Loaded.com is cheaper: $${priceUSD.toFixed(2)} vs $${itadUSD.toFixed(2)} on ITAD`;
        cutChip.textContent = `-${pct}%`;
        cutChip.classList.add('loaded-cut-chip--visible');
      } else {
        badge.classList.add('loaded-pricier');
        badge.textContent = `$${priceUSD.toFixed(2)}`;
        badge.title = `Loaded.com: $${priceUSD.toFixed(2)}`;
      }
    });
  });
}

// MutationObserver to handle initial render + sort/filter re-renders
const observer = new MutationObserver(processItems);
observer.observe(document.body, { childList: true, subtree: true });
console.log('[Loaded] content_waitlist.js loaded');
processItems();
