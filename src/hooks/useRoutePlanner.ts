'use client';

import { useCallback, useState } from 'react';
import { fetchDrivingRoute, RoutingError } from '@/lib/routing/openRouteService';
import { findPoisForStops, type StopQueryPoint } from '@/lib/overpass/overpassClient';
import { getEvenlySpacedStopPoints } from '@/lib/geo/turfHelpers';
import { generateTripTip } from '@/lib/ai/geminiClient';
import { POI_CATEGORIES } from '@/lib/constants';
import type { PlaceResult, PoiCategoryId, RouteStop, TripPlan } from '@/lib/types';

interface RoutePlannerState {
  start: PlaceResult | null;
  end: PlaceResult | null;
  stopCount: number;
  selectedCategories: PoiCategoryId[];
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
}

const DEFAULT_STATE: RoutePlannerState = {
  start: null,
  end: null,
  stopCount: 2,
  selectedCategories: [],
  plan: null,
  aiTip: null,
  isLoading: false,
  error: null,
  poiWarning: null,
  activeStopId: null,
};

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
    setState((prev) => ({ ...prev, stopCount: Math.max(0, Math.min(10, count)) }));
  }, []);

  const toggleCategory = useCallback((categoryId: PoiCategoryId) => {
    setState((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryId)
        ? prev.selectedCategories.filter((id) => id !== categoryId)
        : [...prev.selectedCategories, categoryId],
    }));
  }, []);

  const setActiveStopId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activeStopId: id }));
  }, []);

  const reset = useCallback(() => setState(DEFAULT_STATE), []);

  const planTrip = useCallback(async () => {
    const { start, end, stopCount, selectedCategories } = state;

    if (!start || !end) {
      setState((prev) => ({ ...prev, error: 'Vui lòng chọn cả điểm xuất phát và điểm kết thúc.' }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      poiWarning: null,
      aiTip: null,
      activeStopId: null,
    }));

    // Step 1: the route. A failure here IS blocking — without a route there's
    // nothing to show, so this is the one part of planTrip allowed to throw.
    let route;
    try {
      route = await fetchDrivingRoute(start, end);
    } catch (err) {
      const message =
        err instanceof RoutingError || err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi không xác định khi tính lộ trình.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      return;
    }

    // Step 2: split the route into stop points (pure client-side math, can't fail).
    const stopPoints = getEvenlySpacedStopPoints(route.coordinates, stopCount);
    const activeCategories = POI_CATEGORIES.filter((category) => selectedCategories.includes(category.id));

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

      const { resultsByStop, fetchFailed } = await findPoisForStops(queryPoints, activeCategories);

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
          pois: Object.values(poisByCategory).flat(),
        };
      });
    } catch (err) {
      // Should be unreachable given findPoisForStops never throws, but if
      // something unexpected happens here, degrade to "no POIs" rather than
      // losing the route the user already waited for.
      console.warn('Unexpected error while searching for POIs, showing route without suggestions:', err);
      poiWarning = 'Không thể tải gợi ý địa điểm lúc này. Lộ trình vẫn hiển thị bình thường.';
      stops = stopPoints.map((point, index) => ({
        id: `stop-${index}`,
        order: index + 1,
        lon: point.lon,
        lat: point.lat,
        distanceFromStartKm: point.distanceFromStartKm,
        pois: [],
      }));
    }

    setState((prev) => ({ ...prev, plan: { route, stops }, isLoading: false, poiWarning }));

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
    setStopCount,
    toggleCategory,
    setActiveStopId,
    reset,
    planTrip,
  };
}

export type UseRoutePlannerReturn = ReturnType<typeof useRoutePlanner>;
