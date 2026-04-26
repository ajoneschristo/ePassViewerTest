// ePass Viewer Service Worker
// Handles: PWA install caching + Web Share Target file relay

const CACHE = 'epass-v5';
const APP_SHELL = ['./'];

// ── Install: cache the app shell ──────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ─────
self.addEventListener('fetch', e => {
  // Handle the Web Share Target POST
  if (e.request.method === 'POST') {
    e.respondWith(handleShareTarget(e.request));
    return;
  }
  // Normal GET: cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Share Target handler ───────────────────────────────
// When user shares an XLS from Downloads, Chrome POSTs here.
// We read the file, store it in a temporary IDB slot, then
// redirect to the app — the app reads it on load.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (file && file.size > 0) {
      // Store the file bytes in IDB so the app page can read it
      await storeSharedFile(file);
    }
  } catch (e) {
    console.error('Share target error:', e);
  }

  // Always redirect to the app (GET) after handling the POST
  return Response.redirect('./?shared=1', 303);
}

// ── IDB helpers ────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('epass-share', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('files');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function storeSharedFile(file) {
  const db = await openDB();
  const arrayBuffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({
      name:    file.name,
      type:    file.type,
      size:    file.size,
      buffer:  arrayBuffer,
      ts:      Date.now(),
    }, 'pending');
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}
