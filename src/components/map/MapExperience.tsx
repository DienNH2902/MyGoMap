"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useEffect } from "react";
import { useRoutePlanner } from "@/hooks/useRoutePlanner";
import { RoutePlannerPanel } from "./RoutePlannerPanel";
import { RouteStatsBar } from "./RouteStatsBar";
import { StopDetailDrawer } from "./StopDetailDrawer";
import { OwlLoadingSpinner } from "../ui/OwlLoadingSpinner";

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDelaying(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const activeStop = useMemo(
    () =>
      planner.plan?.stops.find((stop) => stop.id === planner.activeStopId) ??
      null,
    [planner.plan, planner.activeStopId],
  );

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
        onSelectStartFromMap={planner.setStart} // Chọn từ bản đồ làm điểm A
        onSelectEndFromMap={planner.setEnd} // Chọn từ bản đồ làm điểm B
      />

      {planner.plan && (
        <RouteStatsBar route={planner.plan.route} stops={planner.plan.stops} />
      )}

      <StopDetailDrawer
        stop={activeStop}
        onClose={() => planner.setActiveStopId(null)}
      />

      {planner.error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-lg">
          {planner.error}
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
