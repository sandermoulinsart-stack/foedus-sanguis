// ── Foedus Sanguis — Service Worker ──────────────────────────
const CACHE = 'foedus-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/app.css', '/manifest.json'];

// Installation — mise en cache des assets principaux
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

// Fetch — réseau d'abord, cache en fallback
self.addEventListener('fetch', function(e){
  if(e.request.method!=='GET') return;
  e.respondWith(
    fetch(e.request).catch(function(){return caches.match(e.request);})
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', function(e){
  if(!e.data) return;
  var data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Foedus Sanguis', {
      body:    data.body    || '',
      icon:    data.icon    || '/icon-192.png',
      badge:   data.badge   || '/icon-192.png',
      tag:     data.tag     || 'foedus-notif',
      data:    data.url     || '/',
      vibrate: [200, 100, 200],
      actions: data.actions || []
    })
  );
});

// Clic sur la notification → ouvrir l'app sur la bonne page
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = e.notification.data || '/';
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        if(list[i].url.includes(self.location.origin)){
          list[i].focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
