"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useEffect } from "react";
import { useRoutePlanner } from "@/hooks/useRoutePlanner";
import { RoutePlannerPanel } from "./RoutePlannerPanel";
import { RouteStatsBar } from "./RouteStatsBar";
import { StopDetailDrawer } from "./StopDetailDrawer";
import { OwlLoadingSpinner } from "../ui/OwlLoadingSpinner";
import Image from "next/image";
import { usePoiEnrichment } from "@/hooks/usePoiEnrichment";
import { PoiDetailCard } from "./PoiDetailCard";

const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";
type GenderTheme = "nam" | "nu" | "khac";

function getCatImageByGender(gender: GenderTheme): string {
  switch (gender) {
    case "nu":
      return "/assets/nu.png";
    case "khac":
      return "/assets/lgbt.png";
    case "nam":
    default:
      return "/assets/nam.png";
  }
}

// MapLibre reaches into `window`, so it must never render during server-side rendering.
const MapView = dynamic(() => import("./MapView").then((mod) => mod.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted">
      <OwlLoadingSpinner label="Xong rồi!" />
    </div>
  ),
});

/**
 * Composes everything below the header on the /map page: the map itself, the
 * floating trip stats, the stop-detail drawer, any error/AI-tip banners, and
 * the bottom planner panel that drives the whole flow.
 */
export function MapExperience() {
  const planner = useRoutePlanner();
  const [isDelaying, setIsDelaying] = useState(true);
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDelaying(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_USER_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const catImageSrc = getCatImageByGender(gender);

  const activeStop = useMemo(
    () =>
      planner.plan?.stops.find((stop) => stop.id === planner.activeStopId) ??
      null,
    [planner.plan, planner.activeStopId],
  );

  // Điểm POI đang được chọn (bấm chấm trên bản đồ, hoặc nút "Vị trí" ở
  // sidebar) — có thể thuộc một điểm dừng khác với điểm dừng đang mở sidebar.
  const activePoiEntry = useMemo(() => {
    if (!planner.plan || !planner.activePoiId) return null;
    for (const stop of planner.plan.stops) {
      const poi = stop.pois.find(
        (candidate) => candidate.id === planner.activePoiId,
      );
      if (poi) return { poi, stopOrder: stop.order };
    }
    return null;
  }, [planner.plan, planner.activePoiId]);

  const activePoiList = useMemo(
    () => (activePoiEntry ? [activePoiEntry.poi] : []),
    [activePoiEntry],
  );
  const {
    getEnriched: getActivePoiEnriched,
    markImageBroken: markActivePoiImageBroken,
  } = usePoiEnrichment(activePoiList);

  if (isDelaying) {
    return (
      <div className="absolute inset-0 top-16 flex items-center justify-center bg-surface-muted z-50 whitespace-pre-line">
        <OwlLoadingSpinner
          label={`Tôi đang bay lên cao để nhìn bản đồ rõ hơn\nHãy đợi tôi một chút!`}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 top-16">
      <MapView
        start={planner.start}
        end={planner.end}
        route={planner.plan?.route ?? null}
        stops={planner.plan?.stops ?? []}
        activeStopId={planner.activeStopId}
        onSelectStop={planner.setActiveStopId}
        activePoiId={planner.activePoiId}
        onSelectPoi={planner.setActivePoiId}
        onSelectStartFromMap={planner.setStart} // Chọn từ bản đồ làm điểm A
        onSelectEndFromMap={planner.setEnd} // Chọn từ bản đồ làm điểm B
      />

      {/* Hiệu ứng Mèo Lấp Ló bên mép phải màn hình thay đổi theo giới tính */}
      <div className="pointer-events-none absolute right-0 top-1/3 z-40 h-40 w-40 animate-peek-cat">
        <Image
          src={catImageSrc}
          alt="Mèo tò mò"
          fill
          sizes="160px"
          className="object-contain drop-shadow-xl"
        />
      </div>

      {planner.plan && (
        <RouteStatsBar route={planner.plan.route} stops={planner.plan.stops} />
      )}

      <StopDetailDrawer
        stop={activeStop}
        onClose={() => planner.setActiveStopId(null)}
        activePoiId={planner.activePoiId}
        onSelectPoi={planner.setActivePoiId}
      />

      {activePoiEntry && (
        <PoiDetailCard
          poi={activePoiEntry.poi}
          stopOrder={activePoiEntry.stopOrder}
          enriched={getActivePoiEnriched(activePoiEntry.poi)}
          onImageError={() => markActivePoiImageBroken(activePoiEntry.poi.id)}
          onClose={() => planner.setActivePoiId(null)}
        />
      )}

      {planner.error && (
        <div className="absolute left-1/2 top-4 z-40 flex w-[90%] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-2xl backdrop-blur-md m-5 p-2">
          {/* Bên trái: Hình ảnh chiếm tỷ lệ 1/4 (25%) */}
          <div className="relative w-1/4 min-w-[90px] bg-red-50 p-10 flex items-center justify-center ">
            <Image
              src="/assets/Mèo thủy thủ.png"
              alt="Lỗi tính lộ trình"
              fill
              sizes="1200px"
              className="object-cover rounded-xl"
            />
          </div>

          {/* Bên phải: Nội dung thông báo lỗi chiếm 3/4 (75%) */}
          <div className="flex w-3/4 flex-col justify-center p-4 bg-red-50">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 mb-1">
              Không thể tính lộ trình
            </span>
            <p className="text-xs leading-relaxed text-slate-700">
              {planner.error}
            </p>
          </div>
        </div>
      )}

      {/* Soft, non-blocking warning: the route succeeded but POI suggestions
          couldn't be loaded this time. Never replaces the route/stops UI. */}
      {planner.poiWarning && (
        <div className="absolute left-1/2 top-4 z-30 max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 shadow-lg">
          {planner.poiWarning}
        </div>
      )}

      {planner.aiTip && (
        <div className="absolute left-4 top-4 z-30 max-w-xs rounded-2xl border border-accent-gold/30 bg-ink/85 px-4 py-3 text-sm text-cream shadow-xl backdrop-blur-md">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-gold">
            Gợi ý từ AI
          </p>
          <p>{planner.aiTip}</p>
        </div>
      )}

      <RoutePlannerPanel planner={planner} />
    </div>
  );
}
