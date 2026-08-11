'use client';

import { useEffect, useState } from 'react';
import { POI_CATEGORIES } from '@/lib/constants';
import { reverseGeocode } from '@/lib/geocoding/nominatim';
import type { RouteStop } from '@/lib/types';

interface StopDetailDrawerProps {
  stop: RouteStop | null;
  onClose: () => void;
}

function categoryLabel(categoryId: string): string {
  return POI_CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId;
}

function categoryIcon(categoryId: string): string {
  return POI_CATEGORIES.find((category) => category.id === categoryId)?.icon ?? '📍';
}

/** Minimum gap between reverse-geocode calls, to stay within Nominatim's ~1 req/sec policy. */
const REVERSE_GEOCODE_GAP_MS = 1100;

/**
 * Slide-in panel shown after clicking a numbered stop marker on the map.
 * Lists the real POIs found nearby (name, category, address, and a photo when
 * OpenStreetMap happens to have one tagged for that place).
 *
 * Many OSM points only carry an `amenity=fuel` tag and a name — no address
 * fields at all. For those, this component lazily fills in an address via
 * Nominatim reverse-geocoding, ONE request at a time with a ~1.1s gap between
 * them (Nominatim's free tier asks for at most ~1 request/second and no bulk
 * use). This only runs for the POIs currently visible in the open drawer, not
 * for every POI on the whole trip, and stops immediately if the drawer closes.
 */
export function StopDetailDrawer({ stop, onClose }: StopDetailDrawerProps) {
  // POI id -> resolved address text, or `null` once a lookup was attempted
  // but found nothing. Undefined (key absent) means "not attempted yet".
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setResolvedAddresses({});
    if (!stop) return;

    const poisNeedingAddress = stop.pois.filter((poi) => !poi.address);
    if (poisNeedingAddress.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    async function fillAddressesSequentially() {
      for (const poi of poisNeedingAddress) {
        if (cancelled) return;
        const address = await reverseGeocode(poi.lat, poi.lon, controller.signal);
        if (cancelled) return;
        // Always record the outcome (even `null`) so the UI can stop showing
        // "Đang tìm địa chỉ…" once a lookup has actually finished.
        setResolvedAddresses((prev) => ({ ...prev, [poi.id]: address }));
        // Space out requests so we never exceed Nominatim's fair-use rate limit.
        await new Promise((resolve) => setTimeout(resolve, REVERSE_GEOCODE_GAP_MS));
      }
    }

    void fillAddressesSequentially();

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
            Không tìm thấy địa điểm phù hợp trong bán kính đã chọn quanh điểm dừng này.
          </p>
        )}

        {stop.pois.map((poi) => {
          // Prefer the address parsed from OSM tags; fall back to the
          // lazily-resolved reverse-geocoded one once/if it arrives.
          const lookupOutcome = resolvedAddresses[poi.id]; // undefined = not attempted, null = attempted, nothing found
          const address = poi.address ?? lookupOutcome ?? undefined;
          const isLookingUp = !poi.address && lookupOutcome === undefined;

          return (
            <div key={poi.id} className="flex gap-3 px-5 py-4">
              {poi.imageUrl ? (
                // OSM's `image`/`wikimedia_commons` tags are optional and only
                // present on a minority of places, so this always falls back
                // to a category icon below.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poi.imageUrl}
                  alt={poi.name}
                  className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                  onError={(event) => {
                    // A small number of Wikimedia/OSM image links are stale —
                    // hide the broken image instead of showing a broken-icon box.
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-surface-muted text-2xl">
                  {categoryIcon(poi.category)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{poi.name}</p>
                <p className="text-xs text-ink/50">{categoryLabel(poi.category)}</p>
                {address ? (
                  <p className="mt-1 text-xs text-ink/60">{address}</p>
                ) : isLookingUp ? (
                  <p className="mt-1 text-xs italic text-ink/30">Đang tìm địa chỉ…</p>
                ) : (
                  <p className="mt-1 text-xs italic text-ink/30">Chưa rõ địa chỉ</p>
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
