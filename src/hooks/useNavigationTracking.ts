import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/types";
import * as turf from "@turf/turf";
import type { Feature, LineString } from "geojson";

interface UserLocation {
  lat: number;
  lon: number;
  heading: number | null;
  accuracy: number;
}

interface NavigationState {
  isNavigating: boolean;
  userLocation: UserLocation | null;
  distanceToDestination: number | null;
  estimatedTimeRemaining: number | null;
  nearestPointOnRoute: [number, number] | null;
  isOffRoute: boolean;
}

export function useNavigationTracking(
  map: MapLibreMap | null,
  route: RouteGeometry | null,
) {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    userLocation: null,
    distanceToDestination: null,
    estimatedTimeRemaining: null,
    nearestPointOnRoute: null,
    isOffRoute: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const routeLineRef = useRef<Feature<LineString> | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const currentHeadingRef = useRef<number>(0);

  // Khởi tạo Marker hình mũi tên điều hướng
  const getOrCreateMarker = useCallback(() => {
    if (userMarkerRef.current || !map) return userMarkerRef.current;

    // Tạo Element SVG Mũi tên
    const el = document.createElement("div");
    el.className = "user-location-puck";
    el.innerHTML = `
      <div style="
        width: 64px; 
        height: 64px; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
      ">
        <svg width="102" height="102" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="14" fill="#3B82F6" fill-opacity="0.25" />
          <path d="M16 4L25 24L16 20L7 24L16 4Z" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    `;

    userMarkerRef.current = new maplibregl.Marker({
      element: el,
      rotationAlignment: "map",
      pitchAlignment: "map",
    });

    return userMarkerRef.current;
  }, [map]);

  // Lắng nghe cảm biến la bàn di động (cho trường hợp đứng yên vẫn quay mũi tên được)
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let compassHeading: number | null = null;

      // Hỗ trợ iOS (webkitCompassHeading)
      if (
        "webkitCompassHeading" in event &&
        typeof (event as any).webkitCompassHeading === "number"
      ) {
        compassHeading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Hỗ trợ Android
        compassHeading = 360 - event.alpha;
      }

      if (compassHeading !== null) {
        currentHeadingRef.current = compassHeading;
        if (userMarkerRef.current) {
          userMarkerRef.current.setRotation(compassHeading);
        }
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  // Khởi tạo route line từ Turf.js
  useEffect(() => {
    if (!route || !route.coordinates || route.coordinates.length < 2) {
      routeLineRef.current = null;
      return;
    }

    try {
      routeLineRef.current = turf.lineString(route.coordinates);
    } catch (err) {
      console.error("Failed to create route line:", err);
      routeLineRef.current = null;
    }
  }, [route]);

  // Tính khoảng cách và thời gian còn lại
  const calculateRemainingDistance = useCallback(
    (userLat: number, userLon: number) => {
      if (!routeLineRef.current || !route?.coordinates?.length) return null;

      const lastCoord = route.coordinates[route.coordinates.length - 1];
      if (!lastCoord) return null;

      try {
        const userPoint = turf.point([userLon, userLat]);
        const nearestPoint = turf.nearestPointOnLine(
          routeLineRef.current,
          userPoint,
        );

        const destination = turf.point(lastCoord);
        const slicedRoute = turf.lineSlice(
          nearestPoint,
          destination,
          routeLineRef.current,
        );
        const remainingDistance = turf.length(slicedRoute, {
          units: "kilometers",
        });

        const avgSpeed = 40; // km/h
        const remainingTime = (remainingDistance / avgSpeed) * 60; // phút

        const distanceFromRoute = turf.distance(userPoint, nearestPoint, {
          units: "meters",
        });
        const isOffRoute = distanceFromRoute > 100;

        return {
          distanceToDestination: remainingDistance,
          estimatedTimeRemaining: remainingTime,
          nearestPointOnRoute: nearestPoint.geometry.coordinates as [
            number,
            number,
          ],
          isOffRoute,
        };
      } catch (err) {
        console.error("Failed to calculate remaining distance:", err);
        return null;
      }
    },
    [route],
  );

  // Cập nhật vị trí & hướng marker trên bản đồ
  const updateMarker = useCallback(
    (lng: number, lat: number, heading: number | null) => {
      if (!map) return;
      const marker = getOrCreateMarker();
      if (!marker) return;

      const effectiveHeading = heading ?? currentHeadingRef.current ?? 0;

      marker.setLngLat([lng, lat]);
      marker.setRotation(effectiveHeading);

      if (!marker.addTo(map)) {
        marker.addTo(map);
      }
    },
    [map, getOrCreateMarker],
  );

  // Bắt đầu navigation tracking
  const startNavigation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ GPS");
      return;
    }

    if (!route) {
      alert("Chưa có lộ trình để điều hướng");
      return;
    }

    // Yêu cầu cấp quyền cảm biến la bàn trên iOS (Safari)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }

    setState((prev) => ({ ...prev, isNavigating: true }));

    // Lấy vị trí ngay lập tức (fast-path)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading);

        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: 21,
            pitch: 80,
            bearing: heading ?? currentHeadingRef.current ?? 0,
            duration: 800,
          });
        }

        setState((prev) => ({
          ...prev,
          userLocation: {
            lat: latitude,
            lon: longitude,
            heading,
            accuracy,
          },
          distanceToDestination: remaining?.distanceToDestination ?? null,
          estimatedTimeRemaining: remaining?.estimatedTimeRemaining ?? null,
          nearestPointOnRoute: remaining?.nearestPointOnRoute ?? null,
          isOffRoute: remaining?.isOffRoute ?? false,
        }));
      },
      (error) => console.warn("Lỗi lấy vị trí ban đầu:", error),
      { enableHighAccuracy: true, timeout: 5000 },
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // Theo dõi liên tục
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading);

        setState((prev) => {
          if (map && prev.isNavigating) {
            map.easeTo({
              center: [longitude, latitude],
              zoom: 21,
              bearing: heading ?? currentHeadingRef.current ?? 0,
              pitch: 80,
              duration: 400,
            });
          }

          return {
            ...prev,
            userLocation: {
              lat: latitude,
              lon: longitude,
              heading,
              accuracy,
            },
            distanceToDestination: remaining?.distanceToDestination ?? null,
            estimatedTimeRemaining: remaining?.estimatedTimeRemaining ?? null,
            nearestPointOnRoute: remaining?.nearestPointOnRoute ?? null,
            isOffRoute: remaining?.isOffRoute ?? false,
          };
        });
      },
      (error) => {
        console.error("GPS tracking error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          alert("Cần quyền truy cập vị trí để điều hướng.");
          stopNavigation();
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, [map, route, calculateRemainingDistance, updateMarker]);

  // Dừng navigation tracking
  const stopNavigation = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Xóa marker khỏi map khi dừng
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    setState({
      isNavigating: false,
      userLocation: null,
      distanceToDestination: null,
      estimatedTimeRemaining: null,
      nearestPointOnRoute: null,
      isOffRoute: false,
    });

    if (map) {
      map.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 800,
      });
    }
  }, [map]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
  };
}
