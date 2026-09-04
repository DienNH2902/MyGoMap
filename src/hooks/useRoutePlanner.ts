"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchDrivingRoute,
  RoutingError,
} from "@/lib/routing/openRouteService";
import {
  findPoisForStops,
  snapAutoStopsToHighwayExits,
  type StopQueryPoint,
} from "@/lib/overpass/overpassClient";
import {
  getDistanceFromRouteStartKm,
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
  avoidTraffic: boolean;
}

const DEFAULT_STATE: RoutePlannerState = {
  start: null,
  end: null,
  stopMode: "auto",
  stopCount: 0,
  customStops: [],
  selectedCategories: [],
  avoidHighways: true,
  plan: null,
  aiTip: null,
  isLoading: false,
  error: null,
  poiWarning: null,
  activeStopId: null,
  activePoiId: null,
  avoidTraffic: false,
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
 * ============================================================
 * PERSIST KẾ HOẠCH CHUYẾN ĐI VÀO localStorage
 * ============================================================
 * PWA trên iOS Safari (và một số Android) bị hệ điều hành kill tiến trình
 * sau một khoảng chạy nền/khoá màn hình nhất định (quan sát thực tế: khoảng
 * 15 phút) — trang tự tải lại từ đầu, không phải reload chủ động của người
 * dùng, và mất sạch state đang có trong React: đang đi chỉ đường giữa
 * chừng thì mất hết điểm đi/đến, lộ trình, phải tìm và chỉ đường lại từ
 * đầu, rất bất tiện.
 *
 * Để sống sót qua lần "tải lại" đó, mọi lần các field TĨNH dưới đây đổi
 * (điểm đi/đến, chế độ điểm dừng, danh mục đã chọn, lộ trình đã tính...)
 * đều được lưu ngay vào localStorage; khi hook này mount lại (trang tải lại
 * lần nữa), state khởi tạo sẽ đọc lại từ đó thay vì DEFAULT_STATE — coi như
 * chưa từng bị gián đoạn.
 *
 * CHỈ lưu những field có thể khôi phục nguyên trạng. Các field mang tính
 * "đang xử lý của phiên hiện tại" (isLoading, error, poiWarning, aiTip,
 * activeStopId, activePoiId) KHÔNG được lưu — lưu lại chúng sẽ gây hiển thị
 * sai khi mở lại app (ví dụ thấy "Đang tính..." mãi không hết, hoặc một
 * lỗi cũ không còn ý nghĩa).
 *
 * Dữ liệu cũ hơn ROUTE_PLANNER_STORAGE_MAX_AGE_MS bị bỏ qua và xoá — tránh
 * việc mở app sau nhiều giờ không dùng mà vẫn bị khôi phục một chuyến đi cũ
 * đã hết ý nghĩa.
 */
const ROUTE_PLANNER_STORAGE_KEY = "mygomap_route_planner_v1";
const ROUTE_PLANNER_STORAGE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 giờ

interface PersistedRoutePlannerPayload {
  updatedAt: number;
  start: PlaceResult | null;
  end: PlaceResult | null;
  stopMode: StopMode;
  stopCount: number;
  customStops: PlaceResult[];
  selectedCategories: PoiCategoryId[];
  avoidHighways: boolean;
  avoidTraffic: boolean;
  plan: TripPlan | null;
}

function loadPersistedRoutePlannerState(): Partial<RoutePlannerState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ROUTE_PLANNER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedRoutePlannerPayload>;

    if (
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > ROUTE_PLANNER_STORAGE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(ROUTE_PLANNER_STORAGE_KEY);
      return null;
    }

    return {
      start: parsed.start ?? null,
      end: parsed.end ?? null,
      stopMode: parsed.stopMode ?? "auto",
      stopCount: parsed.stopCount ?? 0,
      customStops: parsed.customStops ?? [],
      selectedCategories: parsed.selectedCategories ?? [],
      avoidHighways: parsed.avoidHighways ?? true,
      avoidTraffic: parsed.avoidTraffic ?? false,
      plan: parsed.plan ?? null,
    };
  } catch (err) {
    console.warn("Không đọc được kế hoạch chuyến đi đã lưu:", err);
    return null;
  }
}

function savePersistedRoutePlannerState(state: RoutePlannerState): void {
  if (typeof window === "undefined") return;

  try {
    const payload: PersistedRoutePlannerPayload = {
      updatedAt: Date.now(),
      start: state.start,
      end: state.end,
      stopMode: state.stopMode,
      stopCount: state.stopCount,
      customStops: state.customStops,
      selectedCategories: state.selectedCategories,
      avoidHighways: state.avoidHighways,
      avoidTraffic: state.avoidTraffic,
      plan: state.plan,
    };

    window.localStorage.setItem(
      ROUTE_PLANNER_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch (err) {
    // Bỏ qua lỗi ghi (ví dụ hết quota localStorage) — persistence chỉ là
    // lớp "tiện lợi thêm", không được phép làm hỏng flow chính nếu ghi thất
    // bại.
    console.warn("Không lưu được kế hoạch chuyến đi:", err);
  }
}

function clearPersistedRoutePlannerState(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ROUTE_PLANNER_STORAGE_KEY);
  } catch (err) {
    console.warn("Không xoá được kế hoạch chuyến đi đã lưu:", err);
  }
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
  const [state, setState] = useState<RoutePlannerState>(() => {
    const persisted = loadPersistedRoutePlannerState();
    return persisted ? { ...DEFAULT_STATE, ...persisted } : DEFAULT_STATE;
  });

  // Tự động lưu lại kế hoạch chuyến đi vào localStorage mỗi khi các field
  // "có thể khôi phục" thay đổi — xem giải thích ở
  // savePersistedRoutePlannerState phía trên. Không debounce vì
  // JSON.stringify + localStorage.setItem cho vài KB dữ liệu là rất rẻ.
  useEffect(() => {
    savePersistedRoutePlannerState(state);
  }, [
    state.start,
    state.end,
    state.stopMode,
    state.stopCount,
    state.customStops,
    state.selectedCategories,
    state.avoidHighways,
    state.avoidTraffic,
    state.plan,
  ]);

  const setAvoidTraffic = useCallback((avoidTraffic: boolean) => {
    setState((prev) => ({ ...prev, avoidTraffic }));
  }, []);

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

  const reset = useCallback(() => {
    clearPersistedRoutePlannerState();
    setState(DEFAULT_STATE);
  }, []);

  const planTrip = useCallback(async () => {
    const {
      start,
      end,
      stopMode,
      stopCount,
      customStops,
      selectedCategories,
      avoidHighways,
      avoidTraffic,
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

    const shouldIncludeAlternatives =
      validCustomStops.length === 0 &&
      stopCount === 0 &&
      selectedCategories.length === 0;

    let route;
    try {
      route = await fetchDrivingRoute(
        start,
        end,
        {
          avoidHighways,
          useTraffic: avoidTraffic,
          includeAlternatives: shouldIncludeAlternatives,
        },
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

    const routeChoices =
      route.alternatives && route.alternatives.length > 0
        ? [route, ...route.alternatives]
        : undefined;

    // Step 2: split the route into stop points (pure client-side math, can't fail).
    const activeCategories = POI_CATEGORIES.filter((category) =>
      selectedCategories.includes(category.id),
    );

    const stopPoints =
      stopMode === "custom"
        ? validCustomStops.map((stop) => ({
            lon: stop.lon,
            lat: stop.lat,
            distanceFromStartKm: getDistanceFromRouteStartKm(
              route.coordinates,
              stop,
            ),
            label: stop.label,
            source: "custom" as const,
          }))
        : stopCount > 0
          ? await (async () => {
              const evenPoints = getEvenlySpacedStopPoints(
                route.coordinates,
                stopCount,
              );

              // Ô tô ĐƯỢC đi cao tốc (avoidHighways=false) → mốc chia đều có
              // thể rơi ngay giữa dải phân cách cao tốc, nơi ô tô KHÔNG THỂ
              // dừng hay thoát ra. Xe máy thì không cần bước này vì
              // avoidHighways=true đã khiến ORS né cao tốc hoàn toàn ngay từ
              // lúc tính đường rồi — tuyến của xe máy vốn không đi qua cao
              // tốc để mà phải né mốc dừng trên đó nữa.
              const snapped = avoidHighways
                ? evenPoints.map((point) => ({
                    ...point,
                    snappedToHighwayFeature: false as const,
                  }))
                : await snapAutoStopsToHighwayExits(
                    evenPoints,
                    route.coordinates,
                  );

              return snapped.map((point) => ({
                lon: point.lon,
                lat: point.lat,
                distanceFromStartKm: point.distanceFromStartKm,
                label: point.snappedToHighwayFeature
                  ? (point.highwayFeatureName ??
                    (point.highwayFeatureType === "motorway_junction"
                      ? "Lối ra cao tốc"
                      : "Trạm dừng chân"))
                  : undefined,
                source: "auto" as const,
              }));
            })()
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
      plan: {
        route,
        stops,
        ...(routeChoices ? { routeChoices } : {}),
      },
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

  const selectRouteChoice = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.plan?.routeChoices) return prev;

      const selectedRoute = prev.plan.routeChoices[index];

      if (!selectedRoute) return prev;

      return {
        ...prev,
        plan: {
          ...prev.plan,
          route: selectedRoute,
        },
      };
    });
  }, []);

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
    setAvoidTraffic,
    selectRouteChoice,
  };
}

export type UseRoutePlannerReturn = ReturnType<typeof useRoutePlanner>;
