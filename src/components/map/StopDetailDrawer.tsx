"use client";

import { useEffect, useState } from "react";
import { POI_CATEGORIES } from "@/lib/constants";
import { reverseGeocode } from "@/lib/geocoding/nominatim";
import { findNearbyMapillaryImage } from "@/lib/images/mapillaryClient";
import { findNearbyCommonsImage } from "@/lib/images/wikimediaCommons";
import type { RouteStop } from "@/lib/types";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface StopDetailDrawerProps {
  stop: RouteStop | null;
  onClose: () => void;
  activePoiId?: string | null;
  onSelectPoi?: (id: string | null) => void;
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

const ENRICHMENT_GAP_MS = 1100;

async function resolveImageForPoi(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<string | null> {
  const mapillaryPhoto = await findNearbyMapillaryImage(lat, lon, signal);
  if (mapillaryPhoto) return mapillaryPhoto;
  return findNearbyCommonsImage(lat, lon, signal);
}

export function StopDetailDrawer({
  stop,
  onClose,
  activePoiId,
  onSelectPoi,
}: StopDetailDrawerProps) {
  const [resolvedAddresses, setResolvedAddresses] = useState<
    Record<string, string | null>
  >({});
  const [resolvedImages, setResolvedImages] = useState<
    Record<string, string | null>
  >({});
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getDistanceColorClass = () => {
    if (gender === "nu") return "text-pink-500";
    if (gender === "khac") return "text-purple-600 font-bold";
    return "text-primary";
  };

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
          const addressLookup = resolvedAddresses[poi.id];
          const address = poi.address ?? addressLookup ?? undefined;
          const isLookingUpAddress =
            !poi.address && addressLookup === undefined;

          const imageLookup = resolvedImages[poi.id];
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

                <p
                  className={`mt-1 font-mono text-xs ${getDistanceColorClass()}`}
                >
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
