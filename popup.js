const LOG_KEY = 'loaded_logs';
const logEl = document.getElementById('log');
const statsEl = document.getElementById('stats');
const status = document.getElementById('status');

function classFor(line) {
  if (line.includes('MISS')) return 'miss';
  if (line.includes('HIT')) return 'hit';
  if (line.includes('ERROR')) return 'err';
  return '';
}

function render(lines) {
  lines = lines || [];
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
  logEl.textContent = '';
  for (const l of lines) {
    const div = document.createElement('div');
    div.className = classFor(l);
    div.textContent = l; // textContent — never interprets markup, no XSS
    logEl.appendChild(div);
  }
  const hits = lines.filter(l => l.includes('HIT')).length;
  const miss = lines.filter(l => l.includes('MISS')).length;
  const err = lines.filter(l => l.includes('ERROR')).length;
  statsEl.textContent = `${miss} MISS · ${hits} HIT · ${err} ERR`;
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}

async function refresh() {
  const r = await chrome.storage.local.get(LOG_KEY);
  render(r[LOG_KEY]);
}

// Show the current USD->ILS exchange rate.
chrome.runtime.sendMessage({ type: 'GET_RATE' }, (res) => {
  const rateEl = document.getElementById('rate');
  if (rateEl) rateEl.textContent = res?.rate
    ? `Exchange rate: $1 = ₪${res.rate.toFixed(3)}`
    : 'Exchange rate: unavailable';
});

// Initial paint + live updates as the background writes new log lines.
refresh();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[LOG_KEY]) render(changes[LOG_KEY].newValue);
});

document.getElementById('clear').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(k => k.startsWith('loaded_cache_'));
  if (keys.length) await chrome.storage.local.remove(keys);

  const after = await chrome.storage.local.get(null);
  const remaining = Object.keys(after).filter(k => k.startsWith('loaded_cache_')).length;
  status.textContent = `Cleared ${keys.length} cached price${keys.length === 1 ? '' : 's'}. Remaining: ${remaining}. Reloading…`;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.reload(tab.id);
});

document.getElementById('clearlog').addEventListener('click', async () => {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  status.textContent = 'Log cleared.';
});
