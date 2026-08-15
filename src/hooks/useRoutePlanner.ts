"use client";

import { useCallback, useState } from "react";
import {
  fetchDrivingRoute,
  RoutingError,
} from "@/lib/routing/openRouteService";
import {
  findPoisForStops,
  type StopQueryPoint,
} from "@/lib/overpass/overpassClient";
import {
  getEvenlySpacedStopPoints,
  getPointsAlongRouteEveryKm,
} from "@/lib/geo/turfHelpers";
import { generateTripTip } from "@/lib/ai/geminiClient";
import { POI_CATEGORIES, AUTO_SEARCH_INTERVAL_KM } from "@/lib/constants";
import type {
  PlaceResult,
  PoiCategoryId,
  RouteStop,
  TripPlan,
} from "@/lib/types";

interface RoutePlannerState {
  start: PlaceResult | null;
  end: PlaceResult | null;
  stopCount: number;
  selectedCategories: PoiCategoryId[];
  /**
   * Xe máy (motorbike) legally cannot use cao tốc (expressways) in Vietnam.
   * When true, the route is computed to avoid highways entirely — see
   * RouteOptions in openRouteService.ts.
   */
  avoidHighways: boolean;
  plan: TripPlan | null;
  aiTip: string | null;
  isLoading: boolean;
  /** Blocking error — the route itself could not be computed. Hides the trip result. */
  error: string | null;
  /**
   * Non-blocking warning — the route succeeded but the POI search around one
   * or more stops failed (e.g. Overpass was briefly rate-limited). The trip
   * result still shows; this just tells the user suggestions may be incomplete.
   */
  poiWarning: string | null;
  activeStopId: string | null;
  /** POI (dot) currently selected — either by clicking it on the map, or via the "Vị trí" button in the sidebar. */
  activePoiId: string | null;
}

const DEFAULT_STATE: RoutePlannerState = {
  start: null,
  end: null,
  stopMode: "auto",
  stopCount: 0,
  customStops: [],
  selectedCategories: [],
  avoidHighways: false,
  plan: null,
  aiTip: null,
  isLoading: false,
  error: null,
  poiWarning: null,
  activeStopId: null,
  activePoiId: null,
};

type StopMode = "auto" | "custom";

interface RoutePlannerState {
  start: PlaceResult | null;
  end: PlaceResult | null;
  stopMode: StopMode;
  stopCount: number;
  customStops: PlaceResult[];
  selectedCategories: PoiCategoryId[];
  avoidHighways: boolean;
  plan: TripPlan | null;
  aiTip: string | null;
  isLoading: boolean;
  error: string | null;
  poiWarning: string | null;
  activeStopId: string | null;
  activePoiId: string | null;
}

/**
 * Owns the full trip-planning flow used by the /map page:
 * 1. Get a driving route between start and end from OpenRouteService, kept
 *    strictly inside Vietnam (see `avoid_borders` in openRouteService.ts).
 * 2. Split it into evenly spaced stop points with Turf.js, based on the user's
 *    requested number of stops.
 * 3. Query Overpass ONCE for all stops' nearby POIs together (not one request
 *    per stop — see overpassClient.ts for why that used to cause 429 errors
 *    and long hangs on later stops).
 * 4. Optionally ask Gemini (free tier) for a short human-friendly trip tip.
 *
 * IMPORTANT: a failure while searching for POIs (step 3) NEVER cancels the
 * whole trip — the route is always shown once it's computed, with a soft
 * warning if suggestions couldn't be loaded, rather than the old behavior of
 * throwing away the entire result.
 */
export function useRoutePlanner() {
  const [state, setState] = useState<RoutePlannerState>(DEFAULT_STATE);

  const setStart = useCallback((place: PlaceResult | null) => {
    setState((prev) => ({ ...prev, start: place }));
  }, []);

  const setEnd = useCallback((place: PlaceResult | null) => {
    setState((prev) => ({ ...prev, end: place }));
  }, []);

  const setStopCount = useCallback((count: number) => {
    setState((prev) => ({
      ...prev,
      stopCount: Math.max(0, Math.min(10, count)),
    }));
  }, []);

  const setStopMode = useCallback((stopMode: StopMode) => {
    setState((prev) => ({
      ...prev,
      stopMode,
      plan: null,
      activeStopId: null,
      activePoiId: null,
    }));
  }, []);

  const addCustomStop = useCallback((place: PlaceResult | null = null) => {
    setState((prev) => ({
      ...prev,
      customStops: [
        ...prev.customStops,
        place ?? {
          id: `empty-custom-stop-${Date.now()}`,
          label: "",
          lat: 0,
          lon: 0,
        },
      ],
      stopMode: "custom",
    }));
  }, []);

  const updateCustomStop = useCallback(
    (index: number, place: PlaceResult | null) => {
      setState((prev) => ({
        ...prev,
        customStops: prev.customStops.map((stop, stopIndex) =>
          stopIndex === index
            ? (place ?? {
                id: `empty-custom-stop-${Date.now()}-${index}`,
                label: "",
                lat: 0,
                lon: 0,
              })
            : stop,
        ),
        stopMode: "custom",
      }));
    },
    [],
  );

  const removeCustomStop = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      customStops: prev.customStops.filter(
        (_, stopIndex) => stopIndex !== index,
      ),
    }));
  }, []);

  const addCustomStopFromMap = useCallback((place: PlaceResult) => {
    setState((prev) => ({
      ...prev,
      stopMode: "custom",
      customStops: [...prev.customStops, place],
    }));
  }, []);

  const toggleCategory = useCallback((categoryId: PoiCategoryId) => {
    setState((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryId)
        ? prev.selectedCategories.filter((id) => id !== categoryId)
        : [...prev.selectedCategories, categoryId],
    }));
  }, []);

  const setAvoidHighways = useCallback((avoidHighways: boolean) => {
    setState((prev) => ({ ...prev, avoidHighways }));
  }, []);

  const setActiveStopId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activeStopId: id }));
  }, []);

  const setActivePoiId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activePoiId: id }));
  }, []);

  const reset = useCallback(() => setState(DEFAULT_STATE), []);

  const planTrip = useCallback(async () => {
    const {
      start,
      end,
      stopMode,
      stopCount,
      customStops,
      selectedCategories,
      avoidHighways,
    } = state;

    if (!start || !end) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Vui lòng chọn cả điểm xuất phát và điểm kết thúc.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      poiWarning: null,
      aiTip: null,
      activeStopId: null,
      activePoiId: null,
    }));

    // Step 1: the route. A failure here IS blocking — without a route there's
    // nothing to show, so this is the one part of planTrip allowed to throw.
    const validCustomStops = customStops.filter(
      (stop) =>
        stop.label && Number.isFinite(stop.lat) && Number.isFinite(stop.lon),
    );

    if (
      stopMode === "custom" &&
      customStops.length !== validCustomStops.length
    ) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Vui lòng chọn đầy đủ thông tin cho các điểm dừng tùy chỉnh.",
      }));
      return;
    }

    let route;
    try {
      route = await fetchDrivingRoute(
        start,
        end,
        { avoidHighways },
        stopMode === "custom" ? validCustomStops : [],
      );
    } catch (err) {
      const message =
        err instanceof RoutingError || err instanceof Error
          ? err.message
          : "Đã xảy ra lỗi không xác định khi tính lộ trình.";
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      return;
    }

    // Step 2: split the route into stop points (pure client-side math, can't fail).
    const activeCategories = POI_CATEGORIES.filter((category) =>
      selectedCategories.includes(category.id),
    );

    const stopPoints =
      stopMode === "custom"
        ? validCustomStops.map((stop) => ({
            lon: stop.lon,
            lat: stop.lat,
            distanceFromStartKm: 0,
            label: stop.label,
            source: "custom" as const,
          }))
        : stopCount > 0
          ? getEvenlySpacedStopPoints(route.coordinates, stopCount).map(
              (point) => ({
                ...point,
                source: "auto" as const,
              }),
            )
          : // Không chọn số điểm dừng cụ thể nhưng CÓ chọn danh mục (ví dụ
            // "Cây xăng") → không có mốc nào để tìm quanh cả, nên thay vào đó
            // rải điểm tìm kiếm đều đặn mỗi AUTO_SEARCH_INTERVAL_KM (~50km)
            // dọc suốt tuyến đường, giống như đi dọc đường ngó chừng cây xăng.
            activeCategories.length > 0
            ? getPointsAlongRouteEveryKm(
                route.coordinates,
                AUTO_SEARCH_INTERVAL_KM,
              ).map((point) => ({
                ...point,
                source: "interval" as const,
              }))
            : [];

    // Step 3: POIs for every stop, in a single Overpass request. Wrapped in
    // its own try/catch as a last line of defense — findPoisForStops already
    // swallows its own errors internally and returns `fetchFailed` instead of
    // throwing, but we never want a POI-search bug to take down the route.
    let stops: RouteStop[];
    let poiWarning: string | null = null;
    try {
      const queryPoints: StopQueryPoint[] = stopPoints.map((point, index) => ({
        stopId: `stop-${index}`,
        lon: point.lon,
        lat: point.lat,
      }));

      const { resultsByStop, fetchFailed } = await findPoisForStops(
        queryPoints,
        activeCategories,
      );

      if (fetchFailed && activeCategories.length > 0) {
        poiWarning =
          'Không thể tải gợi ý địa điểm lúc này (máy chủ Overpass đang bận). Lộ trình vẫn hiển thị bình thường, bạn có thể bấm "Bắt đầu" lại để thử tải gợi ý.';
      }

      stops = stopPoints.map((point, index) => {
        const stopId = `stop-${index}`;
        const poisByCategory = resultsByStop.get(stopId) ?? {};
        return {
          id: stopId,
          order: index + 1,
          lon: point.lon,
          lat: point.lat,
          distanceFromStartKm: point.distanceFromStartKm,
          label: "label" in point ? point.label : undefined,
          source: point.source,
          pois: Object.values(poisByCategory).flat(),
        };
      });
    } catch (err) {
      // Should be unreachable given findPoisForStops never throws, but if
      // something unexpected happens here, degrade to "no POIs" rather than
      // losing the route the user already waited for.
      console.warn(
        "Unexpected error while searching for POIs, showing route without suggestions:",
        err,
      );
      poiWarning =
        "Không thể tải gợi ý địa điểm lúc này. Lộ trình vẫn hiển thị bình thường.";
      stops = stopPoints.map((point, index) => ({
        id: `stop-${index}`,
        order: index + 1,
        lon: point.lon,
        lat: point.lat,
        distanceFromStartKm: point.distanceFromStartKm,
        pois: [],
      }));
    }

    setState((prev) => ({
      ...prev,
      plan: { route, stops },
      isLoading: false,
      poiWarning,
    }));

    // Step 4: optional AI tip — fire-and-forget, never blocks or fails the trip.
    void generateTripTip({
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      stopCount: stops.length,
      categories: activeCategories.map((category) => category.label),
    }).then((tip) => {
      setState((prev) => ({ ...prev, aiTip: tip }));
    });
  }, [state]);

  return {
    ...state,
    setStart,
    setEnd,
    setStopMode,
    setStopCount,
    addCustomStop,
    updateCustomStop,
    removeCustomStop,
    addCustomStopFromMap,
    setAvoidHighways,
    toggleCategory,
    setActiveStopId,
    setActivePoiId,
    reset,
    planTrip,
  };
}

export type UseRoutePlannerReturn = ReturnType<typeof useRoutePlanner>;
