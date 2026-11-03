/** Controlla la PWA aperta senza interrompere chi sta scrivendo. */
export function monitorUpdates(
  workers: ServiceWorkerContainer,
  page: Document,
  browser: Window,
  onUpdate: () => void,
): () => void {
  let stopped = false;
  let controlled = !!workers.controller;
  let checking = false;
  let lastCheck = 0;
  let registration: ServiceWorkerRegistration | undefined;

  const check = () => {
    if (stopped || !registration || checking || page.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheck < 60_000) return;
    lastCheck = now;
    checking = true;
    void registration.update().catch(() => { /* offline: il prossimo controllo riprovera */ }).finally(() => { checking = false; });
  };
  const controllerChanged = () => {
    if (controlled && workers.controller) onUpdate();
    controlled = !!workers.controller;
  };
  void workers.ready.then((reg) => { if (!stopped) { registration = reg; check(); } }).catch(() => {});
  workers.addEventListener('controllerchange', controllerChanged);
  page.addEventListener('visibilitychange', check);
  browser.addEventListener('focus', check);
  const timer = browser.setInterval(check, 5 * 60_000);
  return () => {
    stopped = true;
    browser.clearInterval(timer);
    workers.removeEventListener('controllerchange', controllerChanged);
    page.removeEventListener('visibilitychange', check);
    browser.removeEventListener('focus', check);
  };
}
