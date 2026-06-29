// Service Worker for TV Shop Portal
const CACHE_NAME = 'tv-shop-cache-v1';
const ASSETS = [
    '/sup.tvshop/',
    '/sup.tvshop/index.html',
    '/sup.tvshop/app_logo.png?v=2',
    '/sup.tvshop/config.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS).catch(err => {
                console.warn('Failed to cache assets during install:', err);
            });
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Try network first, fall back to cache
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Import OneSignal SDK Worker to handle push notifications in the background
try {
    importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (err) {
    console.error('Failed to import OneSignal script in Service Worker:', err);
}
