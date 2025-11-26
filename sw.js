const CACHE_NAME = 'games-cache-v1';
const GAME_BASE_URL = 'https://sussyboi01.github.io/sdgjseiofjsdioejaklsjfkznjvkdrilgqajfpasjfksgperujscklvgbo4hipasjpasl-/';

// Listen for messages from the page
self.addEventListener('message', async event => {
  if (event.data === 'start-cache') {
    console.log('Service Worker: Starting caching...');
    try {
      const files = await fetchGameList();
      await cacheGamesInBatches(files);
      console.log('Service Worker: Caching complete.');
      event.source.postMessage({ done: true });
    } catch (err) {
      console.error('SW caching error:', err);
    }
  }
});

// Fetch the list of games (HTML files) from GitHub API
async function fetchGameList() {
  const res = await fetch('https://api.github.com/repos/sussyboi01/sdgjseiofjsdioejaklsjfkznjvkdrilgqajfpasjfksgperujscklvgbo4hipasjpasl-/git/trees/main?recursive=1');
  const data = await res.json();
  return (data.tree || []).filter(f => f.path.endsWith('.html')).map(f => GAME_BASE_URL + f.path);
}

// Cache games in batches depending on size
async function cacheGamesInBatches(urls) {
  const cache = await caches.open(CACHE_NAME);
  let cachedCount = 0;

  // Function to fetch and cache a single URL
  async function cacheSingle(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const blob = await resp.clone().blob();
      await cache.put(url, resp);
      cachedCount++;
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ cached: cachedCount, total: urls.length }));
      });
      return blob.size;
    } catch (e) {
      console.warn('Failed to cache:', url, e);
      return 0;
    }
  }

  let batch = [];
  for (let i = 0; i < urls.length; i++) {
    batch.push(urls[i]);
    const resp = await fetch(urls[i], { method: 'HEAD' });
    const size = parseInt(resp.headers.get('content-length') || '0', 10);

    // Determine batch size
    if ((size > 500 * 1024) || batch.length >= 10) { // Large files: 10 per batch
      await Promise.all(batch.map(u => cacheSingle(u)));
      batch = [];
    } else if (size < 5 * 1024 && batch.length >= 150) { // Tiny files: 150 per batch
      await Promise.all(batch.map(u => cacheSingle(u)));
      batch = [];
    }
  }

  // Cache any remaining
  if (batch.length) {
    await Promise.all(batch.map(u => cacheSingle(u)));
  }
}

// Serve cached files if available
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
