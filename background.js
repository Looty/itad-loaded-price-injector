// Force new service worker to activate immediately, replacing any cached old version
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Slug override map: full loaded.com path (after the domain) for slugs that don't follow the default pattern
const SLUG_OVERRIDES = {
  'sekiro-shadows-die-twice-goty-edition': 'sekiro-shadows-die-twice-pc-mea-steam',
  'the-adventures-of-elliot-the-millennium-tales': 'the-adventures-of-elliot-the-millennium-tales-steam',
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Extract inner text of the first element matching a class name (regex-based, no DOMParser)
function extractText(html, className) {
  const m = html.match(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]+)<`));
  return m ? m[1].trim() : null;
}

async function fetchFromLoaded(itadSlug) {
  const url = SLUG_OVERRIDES[itadSlug]
    ? `https://www.loaded.com/${SLUG_OVERRIDES[itadSlug]}`
    : `https://www.loaded.com/${itadSlug}-pc-steam`;
  console.log('[Loaded] Fetching:', url);
  const r = await fetch(url);
  console.log('[Loaded] HTTP status:', r.status);
  if (r.status === 404) return { available: false };
  const html = await r.text();
  // Primary: extract and parse LD+JSON Product block
  const ldMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      if (data['@type'] === 'Product' && data.offers) {
        const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
        console.log('[Loaded] Offer:', offer);
        return {
          available: true,
          inStock: offer.availability?.includes('InStock') ?? false,
          price: offer.price,
          currency: offer.priceCurrency,
          url,
          oldPrice: extractText(html, 'old-price')
        };
      }
    } catch {}
  }
  // Fallback: regex on price classes
  const price = extractText(html, 'final-price');
  const oldPrice = extractText(html, 'old-price');
  console.log('[Loaded] Fallback price:', price);
  if (price) return { available: true, price, currency: 'USD', url, oldPrice };
  return { available: false };
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type !== 'FETCH_LOADED') return;
  const itadSlug = req.slug;
  const cacheKey = `loaded_cache_${itadSlug}`;

  (async () => {
    // Serve from cache if fresh
    const stored = await chrome.storage.local.get(cacheKey);
    const entry = stored[cacheKey];
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
      console.log('[Loaded] Cache hit:', itadSlug);
      sendResponse(entry.data);
      // Refresh cache in background for next visit (fire and forget)
      fetchFromLoaded(itadSlug)
        .then(data => chrome.storage.local.set({ [cacheKey]: { ts: Date.now(), data } }))
        .catch(() => {});
      return;
    }
    // Cache miss — fetch and store
    try {
      const data = await fetchFromLoaded(itadSlug);
      await chrome.storage.local.set({ [cacheKey]: { ts: Date.now(), data } });
      sendResponse(data);
    } catch (err) {
      console.error('[Loaded] Fetch error:', err);
      sendResponse({ available: false });
    }
  })();

  return true; // keep message channel open for async response
});
