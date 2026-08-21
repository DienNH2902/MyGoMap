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
    if (gender === "nu") return "text-pink-400 font-semibold";
    if (gender === "khac") return "text-purple-400 font-semibold";
    return "text-primary font-semibold";
  };

  const getActiveStyles = () => {
    if (gender === "nu") {
      return "bg-pink-500/15 border-l-4 border-pink-500 text-cream";
    }
    if (gender === "khac") {
      return "bg-purple-500/15 border-l-4 border-purple-500 text-cream";
    }
    return "bg-primary/15 border-l-4 border-primary text-cream";
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
    <div className="absolute inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-white/10 bg-ink/90 shadow-2xl backdrop-blur-xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink/80 px-5 py-4 backdrop-blur-md">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cream/50">
            Điểm dừng {stop.order}
          </p>
          <p className="font-mono text-xs text-cream/80">
            Cách điểm xuất phát ~{stop.distanceFromStartKm.toFixed(1)} km
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cream/60 transition hover:bg-white/10 hover:text-cream active:scale-95"
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col divide-y divide-white/10">
        {stop.pois.length === 0 && (
          <p className="px-5 py-8 text-center text-xs text-cream/40">
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

          const isActive = activePoiId === poi.id;

          return (
            <button
              key={poi.id}
              type="button"
              onClick={() => onSelectPoi?.(poi.id)}
              className={`flex w-full gap-3 px-5 py-4 text-left transition-all ${
                isActive ? getActiveStyles() : "hover:bg-white/5"
              }`}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={poi.name}
                  className="h-16 w-16 flex-shrink-0 rounded-xl border border-white/10 object-cover shadow-sm"
                  onError={() => {
                    setBrokenImageIds((prev) => new Set(prev).add(poi.id));
                  }}
                />
              ) : isLookingUpImage ? (
                <div
                  className="h-16 w-16 flex-shrink-0 animate-pulse rounded-xl border border-white/10 bg-black/30"
                  aria-label="Đang tìm ảnh…"
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-black/30 text-2xl text-cream/60">
                  {categoryIcon(poi.category)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-cream">
                  {poi.name}
                </p>
                <p className="text-xs font-medium text-cream/50">
                  {categoryLabel(poi.category)}
                </p>

                {address ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cream/70">
                    {address}
                  </p>
                ) : isLookingUpAddress ? (
                  <p className="mt-1 text-xs italic text-cream/40">
                    Đang tìm địa chỉ…
                  </p>
                ) : (
                  <p className="mt-1 text-xs italic text-cream/40">
                    Chưa rõ địa chỉ
                  </p>
                )}

                {!imageUrl && !isLookingUpImage && (
                  <p className="mt-0.5 text-[11px] italic text-cream/40">
                    Chưa có ảnh cho địa điểm này
                  </p>
                )}

                <p
                  className={`mt-1.5 font-mono text-xs ${getDistanceColorClass()}`}
                >
                  Cách điểm dừng ~{poi.distanceFromStopKm.toFixed(1)} km
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
