"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigationTracking } from "@/hooks/useNavigationTracking";
import type { Map as MapLibreMap } from "maplibre-gl";
import { RoutePlannerPanel } from "./RoutePlannerPanel";
import { RouteStatsBar } from "./RouteStatsBar";
import { StopDetailDrawer } from "./StopDetailDrawer";
import { NavigationControls } from "./NavigationControls";
import { OwlLoadingSpinner } from "../ui/OwlLoadingSpinner";
import Image from "next/image";
import { usePoiEnrichment } from "@/hooks/usePoiEnrichment";
import { PoiDetailCard } from "./PoiDetailCard";
import { MapStyleId, POI_CATEGORIES } from "@/lib/constants";
import type { TripContext } from "@/lib/ai/geminiClient";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { MapStyleToggle } from "./MapStyleToggle";
import { PlaceResult, PoiResult } from "@/lib/types";
import { AroundSearchPanel } from "./SearchAroundPannel";
import { useRoutePlanner } from "@/hooks/useRoutePlanner";
import { QuickDestinationCard } from "./QuickDestinationCard";
import { useQuickDestinationSearch } from "@/hooks/useQuickDestinationSearch ";
import clsx from "clsx";
import { RouteDirectionsPanel } from "./RouteDirectionsPannel";

const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";
const STORAGE_KEY_LOADER = "mygomap_user_loader";

type GenderTheme = "nam" | "nu" | "khac";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(max-width: 767px)").matches;
}

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

// Đường dẫn 3 ảnh mèo bị bắt tương ứng theo giới tính
function getCaughtCatImageByGender(gender: GenderTheme): string {
  switch (gender) {
    case "nu":
      return "/assets/nu-caught.png";
    case "khac":
      return "/assets/lgbt-caught.png";
    case "nam":
    default:
      return "/assets/nam-caught.png";
  }
}

// MapLibre reaches into `window`, so it must never render during server-side rendering.
const MapView = dynamic(
  () =>
    import("./MapView").then((mod) => ({
      default: mod.MapView,
    })),
  {
    ssr: false,
    // loading: () => (
    //   <div className="absolute inset-0 flex items-center justify-center bg-surface-muted z-50 whitespace-pre-line">
    //     <OwlLoadingSpinner label="Xong rồi!" />
    //   </div>
    // ),
  },
);

/**
 * Composes everything below the header on the /map page: the map itself, the
 * floating trip stats, the stop-detail drawer, any error/AI-tip banners, and
 * the bottom planner panel that drives the whole flow.
 */
export function MapExperience() {
  const planner = useRoutePlanner();
  const quickSearch = useQuickDestinationSearch({ planner });
  const mapRef = useRef<MapLibreMap | null>(null);
  // true khi bản đồ MapLibre đã sẵn sàng (đã bắn onMapReady) — dùng làm điều
  // kiện để tự động resume navigation sau khi trang bị tải lại (xem effect
  // "TỰ ĐỘNG RESUME DẪN ĐƯỜNG" bên dưới). mapRef tự nó là ref nên thay đổi
  // không kích hoạt re-render; cần state riêng này để effect phản ứng được
  // đúng lúc bản đồ vừa xong.
  const [isMapReady, setIsMapReady] = useState(false);
  // Đảm bảo chỉ thử tự động resume navigation ĐÚNG MỘT LẦN sau mỗi lần app
  // mở lại — tránh gọi lặp startNavigation() nếu effect chạy lại nhiều lần
  // trong lúc chờ đủ điều kiện (bản đồ sẵn sàng + lộ trình khôi phục xong).
  const hasAttemptedNavigationResumeRef = useRef(false);

  // Chặn MapView tự fitBounds-về-full-tuyến trong lúc đang cố resume dẫn
  // đường sau reload. Dùng STATE (không phải chỉ đọc localStorage trong
  // MapView) để đồng bộ chính xác với thời điểm startNavigation() thực sự
  // được gọi ở component này — tránh khe hở timing giữa "route vừa khôi
  // phục xong" và "isNavigating chuyển true".
  const [fitBoundsSuppressed, setFitBoundsSuppressed] = useState(
    () => false, // sẽ được bật ngay bên dưới nếu phát hiện có phiên cần resume
  );

  // State quản lý Modal "Bạn đã đến nơi"
  const [isArrivalModalOpen, setIsArrivalModalOpen] = useState(false);

  const [isArrivalStopModalOpen, setIsArrivalStopModalOpen] = useState(false);

  const navigationStops = useMemo(
    () =>
      planner.customStops
        .filter(
          (stop) =>
            stop.label &&
            Number.isFinite(stop.lat) &&
            Number.isFinite(stop.lon),
        )
        .map((stop) => ({ id: stop.id, lon: stop.lon, lat: stop.lat })),
    [planner.customStops],
  );

  const navigation = useNavigationTracking(
    mapRef.current,
    planner.plan?.route ?? null,
    planner.end &&
      Number.isFinite(planner.end.lon) &&
      Number.isFinite(planner.end.lat)
      ? { lon: planner.end.lon, lat: planner.end.lat }
      : null,
    { avoidHighways: planner.avoidHighways, useTraffic: planner.avoidTraffic },
    navigationStops,
  );

  // Hiện Modal khi hook xác nhận người dùng đã đến điểm đích.
  useEffect(() => {
    if (navigation.hasArrived) {
      setIsArrivalModalOpen(true);
    }
  }, [navigation.hasArrived]);

  // Hiện Modal khi hook xác nhận người dùng đã đến điểm dừng.
  useEffect(() => {
    if (navigation.stopArrivalInfo) {
      setIsArrivalStopModalOpen(true);
    }

    // Không cần state riêng vì useNavigationTracking đã tự
    // xoá stopArrivalInfo sau thời gian hiển thị.
  }, [navigation.stopArrivalInfo]);

  // Bật cờ chặn fitBounds NGAY khi biết có phiên dẫn đường cần resume — làm
  // ở effect riêng (chạy sớm, không phụ thuộc isMapReady/plan.route) để cờ
  // có hiệu lực từ khung hình đầu tiên MapView vẽ route đã khôi phục.
  useEffect(() => {
    if (!navigation.wasNavigatingBeforeReload) return;

    setFitBoundsSuppressed(true);

    // An toàn: nếu vì lý do gì đó (không xin được GPS, route không khôi
    // phục được...) mà resume không bao giờ xảy ra, đừng khoá fitBounds
    // vĩnh viễn cho các tuyến MỚI người dùng tự lập sau này trong cùng
    // phiên — tự bỏ chặn sau một khoảng thời gian hợp lý.
    const safetyTimer = setTimeout(() => {
      setFitBoundsSuppressed(false);
    }, 8000);

    return () => clearTimeout(safetyTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation.wasNavigatingBeforeReload]);

  useEffect(() => {
    if (hasAttemptedNavigationResumeRef.current) return;
    if (!navigation.wasNavigatingBeforeReload) return;
    if (navigation.isNavigating) return;
    if (!isMapReady || !mapRef.current) return;
    if (!planner.plan?.route) return;

    hasAttemptedNavigationResumeRef.current = true;
    navigation.startNavigation();
    // startNavigation() sẽ tự dùng camera đã lưu (zoom/pitch/bearing/tốc
    // độ) để "về giữa" đúng như trước lúc reload — xem useNavigationTracking.
    // Sau khi đã thực sự bắt đầu, guard `!isNavigating` trong MapView đã đủ
    // để chặn fitBounds, nên có thể bỏ cờ suppress ngay tại đây.
    setFitBoundsSuppressed(false);
  }, [
    navigation.wasNavigatingBeforeReload,
    navigation.isNavigating,
    navigation.startNavigation,
    isMapReady,
    planner.plan?.route,
  ]);

  // Tuyến đường thực sự cần vẽ lên bản đồ: khi đang dẫn đường (đã bấm "Về
  // giữa"), luôn ưu tiên lộ trình vừa được TÍNH LẠI từ vị trí hiện tại của
  // người dùng đến đích (navigation.liveRoute) — không phải tuyến A→B tĩnh
  // đã lập lúc trước. Trước khi lần tính-lại đầu tiên trả về (vài trăm ms),
  // tạm hiển thị route tĩnh để không bị trống bản đồ. Khi KHÔNG dẫn đường,
  // hành vi giữ nguyên 100% như cũ.
  const displayRoute = navigation.isNavigating
    ? (navigation.liveRoute ?? planner.plan?.route ?? null)
    : (planner.plan?.route ?? null);

  const [isDelaying, setIsDelaying] = useState<boolean>(() => {
    // Mobile: vào map ngay, không loader, không kiểm tra localStorage
    if (isMobileDevice()) return false;

    if (typeof window === "undefined") return false;
    const load = localStorage.getItem(STORAGE_KEY_LOADER);
    // Nếu đã có flag "true" thì KHÔNG delay nữa (isDelaying = false)
    return load === "true";
  });

  const [gender, setGender] = useState<GenderTheme>("nam");

  // State quản lý game Bắt Mèo
  const [peekCount, setPeekCount] = useState(1);
  const [isCaught, setIsCaught] = useState(false);

  // State đóng/mở thanh RoutePlannerPanel
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);

  // State quản lý việc ẩn/hiện thông báo lỗi
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  // State quản lý việc ẩn/hiện banner "Gợi ý từ AI"
  const [isAiTipDismissed, setIsAiTipDismissed] = useState(false);

  // Thông báo lỗi định vị (bị từ chối quyền, timeout, trang chạy không an
  // toàn qua HTTP...) — trước đây không có gì hiển thị cho người dùng khi
  // định vị lỗi, đặc biệt hay gặp trên mobile. Tự ẩn sau vài giây.
  const [locationError, setLocationError] = useState<string | null>(null);

  const [isPoiWarningDismissed, setIsPoiWarningDismissed] = useState(false);

  useEffect(() => {
    if (planner.poiWarning) {
      setIsPoiWarningDismissed(false);
    }
  }, [planner.poiWarning]);

  useEffect(() => {
    if (!locationError) return;
    const timer = setTimeout(() => setLocationError(null), 8000);
    return () => clearTimeout(timer);
  }, [locationError]);

  const [aroundSearchCenter, setAroundSearchCenter] =
    useState<PlaceResult | null>(null);
  const [aroundSearchResults, setAroundSearchResults] = useState<PoiResult[]>(
    [],
  );
  const [activeAroundPoiId, setActiveAroundPoiId] = useState<string | null>(
    null,
  );

  const [mapStyleId, setMapStyleId] = useState<MapStyleId>("custom");

  // State kéo/mở Map Style Panel trên Mobile
  const [isMobileStyleOpen, setIsMobileStyleOpen] = useState(false);

  useEffect(() => {
    // Nếu có lỗi mới thì reset lại trạng thái để hiển thị thông báo
    if (planner.error) {
      setIsErrorDismissed(false);
    }
  }, [planner.error]);

  // Reset trạng thái ẩn Gợi ý từ AI mỗi khi có gợi ý mới xuất hiện
  useEffect(() => {
    if (planner.aiTip) {
      setIsAiTipDismissed(false);
    }
  }, [planner.aiTip]);

  useEffect(() => {
    // Nếu đã qua lần đầu rồi thì không bật timer 5s nữa
    if (!isDelaying) return;

    const timer = setTimeout(() => {
      setIsDelaying(false);
      // Lưu lại flag sau khi chạy xong 5 giây lần đầu
      localStorage.setItem(STORAGE_KEY_LOADER, "false");
    }, 5000);

    return () => clearTimeout(timer);
  }, [isDelaying]);

  useEffect(() => {
    if (isMobileDevice()) {
      return;
    }

    const savedGender =
      (localStorage.getItem(STORAGE_KEY_USER_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const catImageSrc = getCatImageByGender(gender);
  const caughtCatImageSrc = getCaughtCatImageByGender(gender);

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

  const activeAroundPoi = useMemo(
    () =>
      aroundSearchResults.find((poi) => poi.id === activeAroundPoiId) ?? null,
    [aroundSearchResults, activeAroundPoiId],
  );

  const activePoiList = useMemo(() => {
    const list: PoiResult[] = [];
    if (activePoiEntry) list.push(activePoiEntry.poi);
    if (activeAroundPoi) list.push(activeAroundPoi);
    return list;
  }, [activePoiEntry, activeAroundPoi]);

  const {
    getEnriched: getActivePoiEnriched,
    markImageBroken: markActivePoiImageBroken,
  } = usePoiEnrichment(activePoiList);

  // Ngữ cảnh chuyến đi truyền cho khung "Hỏi AI" — chỉ có khi đã tính xong lộ
  // trình, để AI luôn trả lời bám sát đúng chuyến đi hiện tại (không phải hỏi
  // đáp chung chung).
  // Ngữ cảnh chuyến đi truyền cho khung "Hỏi AI" — bổ sung vị trí địa lý thực tế
  const tripContext: TripContext | null = useMemo(() => {
    if (!planner.plan) return null;

    const activeCategoryLabels = POI_CATEGORIES.filter((category) =>
      planner.selectedCategories.includes(category.id),
    ).map((category) => category.label);

    // Chuỗi tóm tắt đơn giản fallback
    const stopSummaries = planner.plan.stops.map((stop) => {
      const poiText =
        stop.pois.length > 0
          ? `${stop.pois.length} địa điểm gợi ý`
          : "chưa có địa điểm gợi ý";
      return `Điểm dừng ${stop.order} (cách điểm xuất phát ~${stop.distanceFromStartKm.toFixed(0)}km): ${poiText}`;
    });

    // Mảng chi tiết từng điểm dừng kèm khoảng cách & vị trí địa lý thực tế
    const routeStopPoints = planner.plan.stops.map((stop) => {
      // Ưu tiên lấy tên hành chính/địa danh thực tế của điểm dừng nếu có
      const locationName =
        (
          stop as unknown as {
            locationName?: string;
            cityName?: string;
            address?: string;
          }
        ).locationName ||
        (stop as unknown as { cityName?: string }).cityName ||
        (stop as unknown as { address?: string }).address ||
        `Khu vực mốc ${stop.distanceFromStartKm.toFixed(0)}km`;

      const poiCount = stop.pois.length;
      const summary =
        poiCount > 0 ? `${poiCount} địa điểm gợi ý xung quanh` : undefined;

      return {
        distanceFromStartKm: stop.distanceFromStartKm,
        locationName,
        summary,
      };
    });

    // Ép kiểu chuyển đổi danh sách điểm dừng tự chọn (CustomStops)
    const customStops = planner.customStops.map((cs) => ({
      name: cs.label,
      lat: cs.lat,
      lng: cs.lng,
      address: cs.address,
      locationName: cs.address || cs.label,
    }));

    return {
      distanceKm: planner.plan.route.distanceKm,
      durationMinutes: planner.plan.route.durationMinutes,
      stopCount: planner.plan.stops.length,
      categories: activeCategoryLabels,
      avoidHighways: planner.avoidHighways,
      startLabel: planner.start?.label,
      endLabel: planner.end?.label,
      stopSummaries,
      routeStopPoints,
      customStops,
    };
  }, [
    planner.plan,
    planner.selectedCategories,
    planner.avoidHighways,
    planner.start,
    planner.end,
    planner.customStops,
  ]);

  if (isDelaying) {
    return (
      <div className="absolute inset-0 top-[var(--header-h)] flex items-center justify-center bg-surface-muted z-50 whitespace-pre-line">
        <OwlLoadingSpinner
          label={`Tôi đang bay lên cao để nhìn bản đồ rõ hơn\nHãy đợi tôi một chút!`}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--header-h)] h-[calc(100dvh-var(--header-h))] overflow-hidden">
      <MapView
        start={planner.start}
        end={planner.end}
        route={displayRoute}
        isNavigating={navigation.isNavigating}
        stops={planner.plan?.stops ?? []}
        customStops={planner.customStops}
        activeStopId={planner.activeStopId}
        onSelectStop={planner.setActiveStopId}
        activePoiId={planner.activePoiId}
        onSelectPoi={planner.setActivePoiId}
        onSelectStartFromMap={planner.setStart}
        onSelectEndFromMap={planner.setEnd}
        onSelectCustomStopFromMap={planner.addCustomStopFromMap}
        mapStyleId={mapStyleId}
        showTrafficLayer={planner.avoidTraffic}
        aroundPois={aroundSearchResults}
        activeAroundPoiId={activeAroundPoiId}
        onSelectAroundPoi={setActiveAroundPoiId}
        onOpenAroundSearchFromMap={(place) => {
          setAroundSearchCenter(place);
          setAroundSearchResults([]);
          setActiveAroundPoiId(null);
        }}
        onNavigateToMapPoint={(place) => {
          void quickSearch.selectDestination(place);
        }}
        onLocationError={setLocationError}
        onMapReady={(map) => {
          mapRef.current = map;
          setIsMapReady(true);
        }}
        isQuickSearch={quickSearch.hasSearched}
        preventAutoFitBounds={fitBoundsSuppressed}
      />

      {/* Tìm đường nhanh: chỉ nhập "Nơi đến", điểm A luôn = vị trí GPS */}
      <QuickDestinationCard
        planner={planner}
        quickSearch={quickSearch}
        isNavigating={navigation.isNavigating}
        isPanelOpen={!isPanelCollapsed}
      />

      {/* Navigation Controls - Hiện khi có route */}
      {planner.plan?.route && (
        <NavigationControls
          isNavigating={navigation.isNavigating}
          isFollowing={navigation.isFollowing}
          distanceToDestination={navigation.distanceToDestination}
          estimatedTimeRemaining={navigation.estimatedTimeRemaining}
          isOffRoute={navigation.isOffRoute}
          isRerouting={navigation.isRerouting}
          onStartNavigation={navigation.startNavigation}
          onStopNavigation={navigation.stopNavigation}
          onFollowUserLocation={navigation.followUserLocation}
        />
      )}

      {/* BẢNG/BANNER CHỈ DẪN RẼ TỪNG CHẶNG (kiểu ggmap) — xem RouteDirectionsPanel.tsx */}
      <RouteDirectionsPanel
        route={displayRoute}
        plannedTotalDistanceKm={planner.plan?.route.distanceKm ?? null}
        isNavigating={navigation.isNavigating}
        distanceToDestinationKm={navigation.distanceToDestination}
      />

      {/* HIỂN THỊ TỐC ĐỘ HIỆN TẠI (km/h) KHI ĐANG DẪN ĐƯỜNG — cùng nguồn dữ
          liệu (đã làm mượt) với tốc độ dùng để tính camera zoom/pitch trong
          useNavigationTracking, nên số hiển thị luôn khớp với cảm giác
          camera đang "phản ứng" theo tốc độ thực tế. */}
      {navigation.isNavigating && navigation.speedKmh !== null && (
        <div
          className="pointer-events-none fixed left-4 top-[270px] z-40 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-accent-gold/40 bg-ink/90 shadow-2xl backdrop-blur-md md:hidden"
          aria-label="Tốc độ hiện tại"
        >
          <span className="text-xl font-extrabold leading-none text-cream">
            {Math.round(navigation.speedKmh)}
          </span>

          <span className="text-[11px] font-semibold uppercase tracking-wide text-cream/60">
            km/h
          </span>
        </div>
      )}

      {/* MAP STYLE TOGGLE - DESKTOP CHUẨN */}
      <div className="hidden md:block">
        <MapStyleToggle value={mapStyleId} onChange={setMapStyleId} />
      </div>

      {/* MAP STYLE TOGGLE - MOBILE PANEL KÉO RA KÉO VÀO */}
      {isPanelCollapsed && (
        <div
          className={clsx(
            "fixed top-[calc(var(--header-h)+11rem)] right-0 z-40 transition-transform duration-300 md:hidden",
            isMobileStyleOpen
              ? "translate-x-0"
              : "translate-x-[calc(100%-2.75rem)]",
          )}
        >
          <div className="flex items-start">
            <button
              type="button"
              onClick={() => setIsMobileStyleOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-l-2xl border-y border-l border-white/20 bg-ink/90 text-accent-gold shadow-2xl backdrop-blur-md"
              aria-label="Đổi kiểu bản đồ"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </button>

            <div className="rounded-r-2xl border-y border-r border-white/20 bg-ink/90 p-2 shadow-2xl backdrop-blur-md">
              <MapStyleToggle value={mapStyleId} onChange={setMapStyleId} />
            </div>
          </div>
        </div>
      )}

      {aroundSearchCenter && (
        <AroundSearchPanel
          center={aroundSearchCenter}
          results={aroundSearchResults}
          onResultsChange={setAroundSearchResults}
          onSelectPoi={setActiveAroundPoiId}
          onClose={() => {
            setAroundSearchCenter(null);
            setAroundSearchResults([]);
            setActiveAroundPoiId(null);
          }}
        />
      )}

      {/* HIỆU ỨNG MÈO LẤP LÓ & GAME BẮT MÈO (BỎ HOÀN TOÀN TRÊN MOBILE, GIỮ NGUYÊN TRÊN DESKTOP) */}
      {!isCaught ? (
        <div
          onAnimationIteration={() => setPeekCount((prev) => prev + 1)}
          className="pointer-events-none absolute right-0 top-1/3 z-40 hidden md:flex items-center gap-0 animate-peek-cat"
        >
          {/* Nút Bắt mèo xuất hiện từ lần lú ra thứ 3 trở đi */}
          {peekCount >= 3 && (
            <button
              type="button"
              onClick={() => setIsCaught(true)}
              className="pointer-events-auto cursor-pointer rounded-full bg-accent-gold px-3.5 py-1.5 text-xs font-bold text-ink shadow-2xl border-2 border-white transition-transform hover:scale-110 active:scale-95 whitespace-nowrap"
            >
              Bắt mèo
            </button>
          )}

          <div className="relative h-40 w-40">
            <Image
              src={catImageSrc}
              alt="Mèo tò mò"
              fill
              sizes="160px"
              unoptimized
              className="object-contain drop-shadow-xl"
            />
          </div>
        </div>
      ) : (
        /* Mèo đã bị bắt - Cố định góc dưới bên phải (chỉ hiện desktop) */
        <div className="fixed bottom-6 right-12 z-40 hidden md:flex flex-col items-center gap-1.5 rounded-2xl border border-amber-200/60 bg-white/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="h-full w-full">
            <Image
              src={caughtCatImageSrc}
              alt="Mèo đã bị bắt"
              fill
              sizes="100px"
              unoptimized
              className="object-contain"
            />
          </div>
          {/* <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow">
            Đã bắt mèo
          </span> */}
        </div>
      )}

      {planner.plan && (
        <RouteStatsBar
          route={planner.plan.route}
          stops={planner.plan.stops}
          isNavigating={navigation.isNavigating}
          isPanelOpen={!isPanelCollapsed}
        />
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

      {activeAroundPoi && (
        <PoiDetailCard
          poi={activeAroundPoi}
          stopOrder={0}
          enriched={getActivePoiEnriched(activeAroundPoi)}
          onImageError={() => markActivePoiImageBroken(activeAroundPoi.id)}
          onClose={() => setActiveAroundPoiId(null)}
        />
      )}

      {planner.error && !isErrorDismissed && (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-40 flex w-[90%] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-2xl backdrop-blur-md m-5 p-2">
          {/* Nút đóng thông báo lỗi */}
          <button
            type="button"
            onClick={() => {
              setIsErrorDismissed(true);
              // Nếu planner có hàm resetError/reset thì có thể gọi ở đây, hoặc dùng planner.reset()
            }}
            className="absolute top-3 right-3 z-10 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-slate-700"
            aria-label="Đóng thông báo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Ảnh chỉ hiển thị từ màn hình sm trở lên */}
          <div className="relative hidden sm:flex sm:w-1/4 min-w-[90px] bg-red-50 p-10 items-center justify-center">
            <Image
              src="/assets/Mèo thủy thủ.png"
              alt="Lỗi tính lộ trình"
              fill
              sizes="1200px"
              unoptimized
              className="object-cover rounded-xl"
            />
          </div>

          {/* Phần nội dung chiếm full width trên mobile, 3/4 trên desktop */}
          <div className="flex w-full sm:w-3/4 flex-col justify-center p-4 pr-8 bg-red-50">
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
      {planner.poiWarning && !isPoiWarningDismissed && (
        <div className="pointer-events-auto absolute left-1/2 top-6 z-40 flex w-[90%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 shadow-lg">
          <span className="flex-1 leading-relaxed">{planner.poiWarning}</span>

          <button
            type="button"
            onClick={() => setIsPoiWarningDismissed(true)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-500 transition hover:bg-amber-100 hover:text-amber-700 active:scale-95"
            aria-label="Đóng thông báo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {locationError && (
        <div className="pointer-events-auto absolute left-1/2 top-6 z-40 max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <span>📍 {locationError}</span>
            <button
              type="button"
              onClick={() => setLocationError(null)}
              className="flex-shrink-0 text-amber-500 transition hover:text-amber-700"
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {planner.aiTip && !isAiTipDismissed && (
        <div className="pointer-events-auto absolute left-4 top-[120px] z-3000 hidden max-w-xs rounded-2xl border border-accent-gold/30 bg-ink/85 p-4 text-sm text-cream shadow-xl backdrop-blur-md md:block">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-gold">
              Gợi ý từ MeoMeo AI
            </p>
            <button
              type="button"
              onClick={() => setIsAiTipDismissed(true)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-cream/50 transition hover:bg-white/10 hover:text-cream"
              aria-label="Đóng gợi ý"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-xs leading-relaxed">{planner.aiTip}</p>
        </div>
      )}

      {tripContext && (
        <div className="hidden md:block">
          <AiAssistantPanel tripContext={tripContext} />
        </div>
      )}

      {/* OVERLAY LÀM MỜ BẢN ĐỒ KHI PANEL MỞ TRÊN MOBILE */}
      <div
        onClick={() => setIsPanelCollapsed(true)}
        className={`fixed inset-0 z-20 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          !isPanelCollapsed
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* ROUTE PLANNER PANEL - DESKTOP HOẶC BOTTOM DRAWER SLIDE TRÊN MOBILE */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 pb-[var(--safe-bottom)] transition-transform duration-300 md:static md:pb-0 ${
          isPanelCollapsed
            ? "translate-y-[calc(100%-3rem-var(--safe-bottom))] md:translate-y-0"
            : "translate-y-0"
        }`}
      >
        <RoutePlannerPanel
          planner={planner}
          isCollapsed={isPanelCollapsed}
          onToggleCollapse={() => setIsPanelCollapsed((prev) => !prev)}
          isNavigating={navigation.isNavigating}
        />
      </div>

      {isArrivalStopModalOpen && navigation.stopArrivalInfo && (
        <div className="pointer-events-auto fixed left-1/2 top-20 z-[9998] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-3xl border border-emerald-400/30 bg-ink/95 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  Đã đến điểm dừng
                </p>

                <p className="mt-0.5 text-lg font-extrabold text-cream">
                  Điểm dừng {navigation.stopArrivalInfo.stopOrder}
                </p>
              </div>
            </div>

            {/* Khu vực */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-cream/40">
                Khu vực
              </p>

              <p className="mt-1 text-sm font-semibold leading-relaxed text-cream">
                📍 {navigation.stopArrivalInfo.areaLabel}
              </p>
            </div>

            {/* Thống kê */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-cream/40">
                  Đã đi được
                </p>

                <p className="mt-1 text-xl font-extrabold text-emerald-400">
                  {navigation.stopArrivalInfo.traveledKm.toFixed(1)}
                  <span className="ml-1 text-xs font-semibold text-cream/50">
                    km
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-cream/40">
                  Còn lại
                </p>

                <p className="mt-1 text-xl font-extrabold text-accent-gold">
                  {navigation.stopArrivalInfo.remainingKm.toFixed(1)}
                  <span className="ml-1 text-xs font-semibold text-cream/50">
                    km
                  </span>
                </p>
              </div>
            </div>

            {/* Footer / Ghi chú */}
            <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-cream/50">
              <span>✓</span>
              <span>Tiếp tục hành trình đến điểm dừng tiếp theo</span>
            </div>

            {/* Nút Đóng (Đưa vào trong p-5) */}
            <button
              type="button"
              onClick={() => setIsArrivalStopModalOpen(false)}
              className="mt-5 w-full rounded-2xl bg-accent-gold px-5 py-3 text-sm font-extrabold text-ink shadow-lg transition hover:brightness-110 active:scale-[0.98]"
            >
              Đóng
            </button>
          </div>

          {/* Thanh thời gian 5 giây */}
          <div className="h-1 w-full bg-white/5">
            <div className="h-full w-full origin-left animate-[shrink_10s_linear_forwards] bg-emerald-400" />
          </div>
        </div>
      )}

      {/* MODAL THÔNG BÁO ĐÃ ĐẾN NƠI */}
      {isArrivalModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="arrival-modal-title"
        >
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-accent-gold/30 bg-ink shadow-2xl">
            {/* Nút đóng */}
            {/* <button
              type="button"
              onClick={() => setIsArrivalModalOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-cream/70 transition hover:bg-white/20 hover:text-cream active:scale-95"
              aria-label="Đóng thông báo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button> */}

            {/* Hình mèo */}
            {/* <div className="relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-b from-accent-gold/10 to-transparent">
              <Image
                src="/assets/Mèo giảng viên.png"
                alt="Mèo Giáo Viên Map"
                fill
                sizes="320px"
                unoptimized
                className="object-contain p-4"
              />
            </div> */}

            {/* Nội dung */}
            <div className="px-6 pb-6 pt-5 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-9 w-9 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={4}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <p
                id="arrival-modal-title"
                className="text-xl font-extrabold text-cream"
              >
                Bạn đã đến nơi! 🎉
              </p>

              <p className="mt-2 text-sm leading-relaxed text-cream/65">
                Chuyến đi của bạn đã đến điểm đích. Chúc bạn có một hành trình
                thật vui vẻ!
              </p>

              <button
                type="button"
                onClick={() => setIsArrivalModalOpen(false)}
                className="mt-5 w-full rounded-2xl bg-accent-gold px-5 py-3 text-sm font-extrabold text-ink shadow-lg transition hover:brightness-110 active:scale-[0.98]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
