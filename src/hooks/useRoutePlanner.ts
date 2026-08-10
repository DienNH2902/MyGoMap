'use client';

import { useCallback, useState } from 'react';
import { fetchDrivingRoute, RoutingError } from '@/lib/routing/openRouteService';
import { findPoisNearPoint } from '@/lib/overpass/overpassClient';
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
  error: string | null;
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
  activeStopId: null,
};

/**
 * Owns the full trip-planning flow used by the /map page:
 * 1. Get a driving route between start and end from OpenRouteService.
 * 2. Split it into evenly spaced stop points with Turf.js, based on the user's
 *    requested number of stops.
 * 3. For each stop, query Overpass for nearby POIs matching the selected
 *    categories (trạm xăng, quán ăn, cà phê, ...).
 * 4. Optionally ask Gemini (free tier) for a short human-friendly trip tip.
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

    setState((prev) => ({ ...prev, isLoading: true, error: null, aiTip: null, activeStopId: null }));

    try {
      const route = await fetchDrivingRoute(start, end);
      const stopPoints = getEvenlySpacedStopPoints(route.coordinates, stopCount);
      const activeCategories = POI_CATEGORIES.filter((category) =>
        selectedCategories.includes(category.id)
      );

      // Giải pháp 1: Xử lý tuần tự với delay giữa các requests thay vì Promise.all
      // Điều này tránh gửi quá nhiều requests đồng thời đến Overpass API
      const stops: RouteStop[] = [];
      
      for (let index = 0; index < stopPoints.length; index++) {
        const point = stopPoints[index];

        // Thêm delay 1.5 giây giữa mỗi request (trừ request đầu tiên)
        // Overpass API yêu cầu ít nhất 1 giây giữa các requests
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        const poisByCategory =
          activeCategories.length > 0
            ? await findPoisNearPoint({ lon: point.lon, lat: point.lat }, activeCategories)
            : {};

        stops.push({
          id: `stop-${index}`,
          order: index + 1,
          lon: point.lon,
          lat: point.lat,
          distanceFromStartKm: point.distanceFromStartKm,
          pois: Object.values(poisByCategory).flat(),
        });
      }

      setState((prev) => ({ ...prev, plan: { route, stops }, isLoading: false }));

      // Fire-and-forget: the AI tip is a nice-to-have that shouldn't block the UI.
      void generateTripTip({
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        stopCount: stops.length,
        categories: activeCategories.map((category) => category.label),
      }).then((tip) => {
        setState((prev) => ({ ...prev, aiTip: tip }));
      });
    } catch (err) {
      const message =
        err instanceof RoutingError || err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi không xác định khi lập lộ trình.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
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
