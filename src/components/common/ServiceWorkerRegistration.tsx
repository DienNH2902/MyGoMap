"use client";

import { useEffect } from "react";

/**
 * next-pwa's `register: true` only injects its auto-registration script for
 * the Pages Router (`_document.js`) — this project uses the App Router
 * (`src/app`), which has no such file, so that script never ran. `sw.js` was
 * being built correctly the whole time but never actually installed in any
 * browser, so nothing was ever cached — this is why opening the app from the
 * iOS home screen icon while offline went straight to the network and
 * Safari showed its native "no internet connection" page instead of a
 * cached app.
 *
 * This component registers the service worker manually — the officially
 * recommended workaround for next-pwa + App Router. Mounted once in the
 * root layout.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // skipWaiting is already set in next.config.mjs, but if a new SW
        // version finishes installing while the app is already open, make
        // sure it takes over as soon as possible rather than waiting for
        // every tab to fully close first.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch (err) {
        console.warn("Không thể đăng ký service worker:", err);
      }
    };

    register();
  }, []);

  return null;
}
