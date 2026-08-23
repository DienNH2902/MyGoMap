"use client";

import Image from "next/image";

/**
 * Served by the service worker (see next.config.mjs `fallbacks.document`)
 * whenever a page navigation fails because the device is offline. This is
 * deliberately a small, static page instead of falling back to the full app
 * shell ("/"): the map, routing, and search features all depend on live
 * third-party APIs (OpenRouteService, TomTom, Overpass, Nominatim...) that
 * simply cannot work offline no matter how much HTML/JS is cached — showing
 * the full interactive shell with a map that can't load tiles or a search
 * box that can't return anything would look broken. Saying so clearly here
 * is more honest and less confusing than that.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
      <Image
        src="/icons/icon-192x192.png"
        alt="Mỳ Gõ Map"
        width={96}
        height={96}
        className="rounded-3xl shadow-lg"
        priority
      />

      <div className="space-y-2">
        <h1 className="font-display text-xl font-bold text-ink">
          Bạn đang ngoại tuyến
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink/60">
          Mỳ Gõ Map cần kết nối Internet để tải bản đồ, tìm đường và gợi ý
          địa điểm dọc tuyến đường. Hãy kiểm tra Wi-Fi/dữ liệu di động rồi thử
          lại nhé.
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"
      >
        Thử lại
      </button>
    </main>
  );
}
