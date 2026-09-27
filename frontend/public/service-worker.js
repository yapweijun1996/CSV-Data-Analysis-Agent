const BUILD_VERSION = '__PWA_BUILD_VERSION__';
const PRECACHE_URLS = /*__PWA_PRECACHE__*/ [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './favicon.svg',
  './app-icon.svg'
];
const SHELL_CACHE = `csv-analysis-shell-${BUILD_VERSION}`;
const RUNTIME_CACHE = `csv-analysis-runtime-${BUILD_VERSION}`;
const OWNED_CACHE_PREFIX = 'csv-analysis-';

// Updates remain waiting until the application posts SKIP_WAITING after user confirmation.

const scopeUrl = () => new URL(self.registration.scope);
const scopedUrl = path => new URL(path.replace(/^\.\//, ''), scopeUrl()).toString();

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(PRECACHE_URLS.map(scopedUrl));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(OWNED_CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
      .map(key => caches.delete(key)));
    // Do not claim an already-open page. WebKit can reload the document when a
    // newly activated worker takes control, which would discard an in-flight
    // CSV import. The worker controls the next navigation, while explicit
    // updates continue to reload only after the user accepts them.
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'PWA_VERSION', version: BUILD_VERSION });
  }
});

const cacheRuntimeResponse = async (request, response) => {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  return response;
};

const navigationResponse = async request => {
  const requestUrl = new URL(request.url);
  const rootUrl = scopeUrl();
  try {
    const response = await fetch(request);
    if (response.ok) return cacheRuntimeResponse(request, response);
    if (requestUrl.pathname !== rootUrl.pathname) {
      return Response.redirect(rootUrl.toString(), 302);
    }
    return response;
  } catch {
    if (requestUrl.pathname !== rootUrl.pathname) {
      return Response.redirect(rootUrl.toString(), 302);
    }
    const shell = await caches.match(scopedUrl('./index.html'));
    return shell || caches.match(scopedUrl('./offline.html'));
  }
};

const localAssetResponse = async request => {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheRuntimeResponse(request, await fetch(request));
  } catch {
    return Response.error();
  }
};

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  event.respondWith(localAssetResponse(request));
});
