/**
 * One-time cleanup for stale same-origin service workers.
 *
 * NoDue ships NO service worker (no registration code, no workbox, no PWA
 * manifest, no /sw.js). However, localhost origins are shared across
 * projects: a worker installed by an earlier/different deployment on this
 * origin can keep controlling NoDue pages with a script URL our app no
 * longer serves. Such an orphaned worker fails CacheStorage operations and
 * rejects fetch events, producing console errors that look like ours but
 * are not.
 *
 * This routine unregisters ONLY provably-orphaned same-origin workers:
 * a registration is touched only when its own script URL no longer resolves
 * from the current deployment (so it can never self-update again). Foreign
 * extension contexts are invisible to this API by platform design and are
 * never affected. Cache deletion is limited to the NoDue `nodue-*`
 * namespace. The whole pass is idempotent and never throws into the app.
 */
/**
 * Parse-time twin of {@link cleanupStaleServiceWorkers}, inlined into the
 * document so it executes during HTML parsing — before any Next.js chunk
 * loads. This covers the deadlock where a stale worker breaks chunk loading
 * itself (chunk 404s / rejected fetches): the React-mounted cleanup would
 * never boot in that state, but this script has zero dependencies and always
 * runs. Same scoping rules: same-origin only, orphaned scripts only,
 * `nodue-*` caches only, never throws.
 */
export const SW_CLEANUP_INLINE_SCRIPT = `(function(){try{if(typeof window==="undefined")return;if(!("serviceWorker" in navigator))return;if(window.__nodueSwCleanupDone)return;window.__nodueSwCleanupDone=true;navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(reg){try{var w=reg.active||reg.installing||reg.waiting;if(!w||!w.scriptURL)return;var url;try{url=new URL(w.scriptURL);}catch(e){return;}if(url.origin!==window.location.origin)return;fetch(url.pathname,{method:"HEAD",credentials:"same-origin"}).then(function(res){if(!res.ok)cleanup(reg,url.pathname);},function(){cleanup(reg,url.pathname);});}catch(e){}});},function(){});function cleanup(reg,path){try{var p=reg.unregister();if(p&&p.catch)p.catch(function(){});}catch(e){}try{if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){if(k.indexOf("nodue-")===0){try{var d=caches.delete(k);if(d&&d.catch)d.catch(function(){});}catch(e){}}});},function(){});}}catch(e){}try{if(console&&console.debug)console.debug("[NoDue] unregistered orphaned service worker: "+path);}catch(e){}}}catch(e){}})();`;

let cleanupDone = false;

function isNoDueCache(key: string): boolean {
  return key.startsWith("nodue-");
}

export function cleanupStaleServiceWorkers(): void {
  if (cleanupDone) return;
  cleanupDone = true;

  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      let registrations: readonly ServiceWorkerRegistration[] = [];
      try {
        registrations = await navigator.serviceWorker.getRegistrations();
      } catch {
        return; // Service workers unavailable — nothing to clean.
      }

      for (const reg of registrations) {
        try {
          const scriptURL =
            reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL;
          if (!scriptURL) continue;

          let url: URL;
          try {
            url = new URL(scriptURL);
          } catch {
            continue;
          }
          // Platform guarantee: only same-origin registrations are listed.
          if (url.origin !== window.location.origin) continue;

          // Confirm the worker is orphaned: its script must still resolve
          // from the current deployment, otherwise leave it alone.
          let orphaned = false;
          try {
            const res = await fetch(url.pathname, {
              method: "HEAD",
              credentials: "same-origin",
            });
            orphaned = !res.ok;
          } catch {
            // Script unreachable (e.g. intercepted by the broken worker
            // itself) — it can never update, so treat as orphaned.
            orphaned = true;
          }
          if (!orphaned) continue;

          try {
            await reg.unregister();
          } catch {
            // Keep the page functional even if unregister fails.
          }

          try {
            const keys = await caches.keys();
            for (const key of keys) {
              if (!isNoDueCache(key)) continue;
              try {
                await caches.delete(key);
              } catch {
                // Best effort per cache.
              }
            }
          } catch {
            // CacheStorage unavailable — nothing to clean.
          }

          if (process.env.NODE_ENV === "development") {
            console.debug(`[NoDue] unregistered orphaned service worker: ${url.pathname}`);
          }
        } catch {
          // Per-registration failures must not abort the remaining pass.
        }
      }
    })();
  } catch {
    // SW hygiene must never break the application.
  }
}
