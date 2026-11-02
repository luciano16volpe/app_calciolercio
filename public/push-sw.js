// Notifiche push: mostra l'avviso quando arriva e, toccandolo, apre (o porta in primo piano) l'app.
// Caricato dal service worker dell'app (vite-plugin-pwa: workbox.importScripts).
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'CalcioLercio', {
      body: d.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/icon-64.png',
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
