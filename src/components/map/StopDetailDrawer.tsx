"use client";

import { useEffect, useState } from "react";
import { POI_CATEGORIES } from "@/lib/constants";
import { reverseGeocode } from "@/lib/geocoding/nominatim";
import { findNearbyMapillaryImage } from "@/lib/images/mapillaryClient";
import { findNearbyCommonsImage } from "@/lib/images/wikimediaCommons";
import type { RouteStop } from "@/lib/types";

interface StopDetailDrawerProps {
  stop: RouteStop | null;
  onClose: () => void;
}

function categoryLabel(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.label ??
    categoryId
  );
}

function categoryIcon(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.icon ?? "📍"
  );
}

/** Minimum gap between enrichment steps, dominated by Nominatim's ~1 req/sec fair-use policy. */
const ENRICHMENT_GAP_MS = 1100;

/**
 * Tries every free photo source in priority order and returns the first hit:
 * 1. Mapillary (real street-level photo, best coverage of ordinary places —
 *    only active if NEXT_PUBLIC_MAPILLARY_TOKEN is configured).
 * 2. Wikimedia Commons (geotagged photo, landmark-oriented, needs no setup).
 * Resolves to null if neither source has anything nearby — this is expected
 * and normal for small/unphotographed places, not an error.
 */
async function resolveImageForPoi(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<string | null> {
  const mapillaryPhoto = await findNearbyMapillaryImage(lat, lon, signal);
  if (mapillaryPhoto) return mapillaryPhoto;
  return findNearbyCommonsImage(lat, lon, signal);
}

/**
 * Slide-in panel shown after clicking a numbered stop marker on the map.
 * Lists the real POIs found nearby (name, category, address, and a photo).
 *
 * Most OSM points only carry a category tag and a name — no address or photo
 * fields at all. For those, this component lazily enriches each POI with:
 * - an address, via Nominatim reverse-geocoding, and
 * - a real photo, via Mapillary then Wikimedia Commons (see `resolveImageForPoi`).
 * Both run ONE POI at a time with a ~1.1s gap between POIs (Nominatim's free
 * tier asks for at most ~1 request/second and no bulk use — the slowest of
 * the three services involved, so we pace everything to that). This only
 * runs for the POIs currently visible in the open drawer, not the whole trip,
 * and stops immediately if the drawer closes.
 *
 * IMPORTANT / honest limitation: even with all three free sources combined,
 * this will NOT find a photo for every single place — small or newly-listed
 * businesses often have no photo anywhere on the open web. Google Maps' much
 * higher hit rate comes from its own paid, proprietary Places Photos database
 * built from years of user contributions; that level of coverage isn't
 * reproducible for free. When no photo is found, the UI clearly says so
 * instead of showing a placeholder that could be mistaken for a real photo.
 */
export function StopDetailDrawer({ stop, onClose }: StopDetailDrawerProps) {
  // POI id -> resolved value, or `null` once a lookup was attempted but found
  // nothing. Undefined (key absent) means "not attempted yet / still loading".
  const [resolvedAddresses, setResolvedAddresses] = useState<
    Record<string, string | null>
  >({});
  const [resolvedImages, setResolvedImages] = useState<
    Record<string, string | null>
  >({});
  // Tracks image URLs (from OSM tags OR a resolved fallback) that failed to
  // actually load in the browser, so a stale/broken link doesn't get stuck
  // showing a broken-image box forever.
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setResolvedAddresses({});
    setResolvedImages({});
    setBrokenImageIds(new Set());

    if (!stop) return;

    const poisNeedingEnrichment = stop.pois.filter(
      (poi) => !poi.address || !poi.imageUrl,
    );
    if (poisNeedingEnrichment.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    async function enrichSequentially() {
      for (const poi of poisNeedingEnrichment) {
        if (cancelled) return;

        // Address and image lookups for a POI run in parallel (they hit
        // different services), but we still only move to the NEXT poi after
        // waiting the gap below — that's what keeps Nominatim usage within
        // its fair-use rate limit across the whole drawer.
        const [address, image] = await Promise.all([
          poi.address
            ? Promise.resolve(null)
            : reverseGeocode(poi.lat, poi.lon, controller.signal),
          poi.imageUrl
            ? Promise.resolve(null)
            : resolveImageForPoi(poi.lat, poi.lon, controller.signal),
        ]);

        if (cancelled) return;

        if (!poi.address)
          setResolvedAddresses((prev) => ({ ...prev, [poi.id]: address }));
        if (!poi.imageUrl)
          setResolvedImages((prev) => ({ ...prev, [poi.id]: image }));

        await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_GAP_MS));
      }
    }

    void enrichSequentially();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stop]);

  if (!stop) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-ink/10 bg-white shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Điểm dừng {stop.order}
          </p>
          <p className="font-mono text-sm text-ink/70">
            Cách điểm xuất phát {stop.distanceFromStartKm.toFixed(1)} km
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 transition hover:bg-ink/5 hover:text-ink"
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col divide-y divide-ink/5">
        {stop.pois.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink/40">
            Không tìm thấy địa điểm phù hợp trong bán kính đã chọn quanh điểm
            dừng này.
          </p>
        )}

        {stop.pois.map((poi) => {
          // --- Address: prefer OSM tags, fall back to the lazily-resolved value. ---
          const addressLookup = resolvedAddresses[poi.id]; // undefined = in progress, null = not found
          const address = poi.address ?? addressLookup ?? undefined;
          const isLookingUpAddress =
            !poi.address && addressLookup === undefined;

          // --- Photo: prefer OSM tags, fall back to Mapillary/Commons, and
          // ignore anything that already failed to actually load in <img>. ---
          const imageLookup = resolvedImages[poi.id]; // undefined = in progress, null = not found
          const rawImageUrl = poi.imageUrl ?? imageLookup ?? undefined;
          const imageUrl =
            rawImageUrl && !brokenImageIds.has(poi.id)
              ? rawImageUrl
              : undefined;
          const isLookingUpImage = !poi.imageUrl && imageLookup === undefined;

          return (
            <div key={poi.id} className="flex gap-3 px-5 py-4">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={poi.name}
                  className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                  onError={() => {
                    // The link resolved but the image itself didn't load (stale
                    // Commons/Mapillary URL) — fall back to the category icon
                    // instead of leaving a broken-image box on screen.
                    setBrokenImageIds((prev) => new Set(prev).add(poi.id));
                  }}
                />
              ) : isLookingUpImage ? (
                <div
                  className="h-16 w-16 flex-shrink-0 animate-pulse rounded-xl bg-surface-muted"
                  aria-label="Đang tìm ảnh…"
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-surface-muted text-2xl">
                  {categoryIcon(poi.category)}
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {poi.name}
                </p>
                <p className="text-xs text-ink/50">
                  {categoryLabel(poi.category)}
                </p>

                {address ? (
                  <p className="mt-1 text-xs text-ink/60">{address}</p>
                ) : isLookingUpAddress ? (
                  <p className="mt-1 text-xs italic text-ink/30">
                    Đang tìm địa chỉ…
                  </p>
                ) : (
                  <p className="mt-1 text-xs italic text-ink/30">
                    Chưa rõ địa chỉ
                  </p>
                )}

                {!imageUrl && !isLookingUpImage && (
                  <p className="mt-0.5 text-[11px] italic text-ink/30">
                    Chưa có ảnh cho địa điểm này
                  </p>
                )}

                <p className="mt-1 font-mono text-xs text-primary">
                  Cách điểm dừng ~{poi.distanceFromStopKm.toFixed(1)} km
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
