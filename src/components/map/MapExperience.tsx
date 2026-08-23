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
import { MapStyleId, POI_CATEGORIES } from "@/lib/constants";
import type { TripContext } from "@/lib/ai/geminiClient";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { MapStyleToggle } from "./MapStyleToggle";
import { PlaceResult, PoiResult } from "@/lib/types";
import { AroundSearchPanel } from "./SearchAroundPannel";

const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";
const STORAGE_KEY_LOADER = "mygomap_user_loader";

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

  const [isDelaying, setIsDelaying] = useState<boolean>(() => {
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

  const [aroundSearchCenter, setAroundSearchCenter] =
    useState<PlaceResult | null>(null);
  const [aroundSearchResults, setAroundSearchResults] = useState<PoiResult[]>(
    [],
  );
  const [activeAroundPoiId, setActiveAroundPoiId] = useState<string | null>(
    null,
  );

  const [mapStyleId, setMapStyleId] = useState<MapStyleId>("street");

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
      <div className="absolute inset-0 top-16 flex items-center justify-center bg-surface-muted z-50 whitespace-pre-line">
        <OwlLoadingSpinner
          label={`Tôi đang bay lên cao để nhìn bản đồ rõ hơn\nHãy đợi tôi một chút!`}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-16 bottom-0 h-[calc(100dvh-4rem)] overflow-hidden">
      <MapView
        start={planner.start}
        end={planner.end}
        route={planner.plan?.route ?? null}
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
      />

      {/* MAP STYLE TOGGLE - DESKTOP CHUẨN */}
      <div className="hidden md:block">
        <MapStyleToggle value={mapStyleId} onChange={setMapStyleId} />
      </div>

      {/* MAP STYLE TOGGLE - MOBILE PANEL KÉO RA KÉO VÀO */}
      <div
        className={`fixed top-20 right-0 z-40 transition-transform duration-300 md:hidden ${
          isMobileStyleOpen
            ? "translate-x-0"
            : "translate-x-[calc(100%-2.75rem)]"
        }`}
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
          <div className="rounded-l-none rounded-r-2xl border border-white/20 bg-ink/90 p-2 shadow-2xl backdrop-blur-md">
            <MapStyleToggle value={mapStyleId} onChange={setMapStyleId} />
          </div>
        </div>
      </div>

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

          <div className="relative w-1/4 min-w-[90px] bg-red-50 p-10 flex items-center justify-center">
            <Image
              src="/assets/Mèo thủy thủ.png"
              alt="Lỗi tính lộ trình"
              fill
              sizes="1200px"
              unoptimized
              className="object-cover rounded-xl"
            />
          </div>

          <div className="flex w-3/4 flex-col justify-center p-4 pr-8 bg-red-50">
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
        <div className="pointer-events-auto absolute left-1/2 top-4 z-30 max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 shadow-lg">
          {planner.poiWarning}
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

      {/* ROUTE PLANNER PANEL - DESKTOP HOẶC BOTTOM DRAWER SLIDE TRÊN MOBILE */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 md:static ${
          isPanelCollapsed
            ? "translate-y-[calc(100%-3rem)] md:translate-y-0"
            : "translate-y-0"
        }`}
      >
        <RoutePlannerPanel
          planner={planner}
          isCollapsed={isPanelCollapsed}
          onToggleCollapse={() => setIsPanelCollapsed((prev) => !prev)}
        />
      </div>
    </div>
  );
}
