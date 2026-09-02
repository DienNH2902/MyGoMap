"use client";

import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { CategoryChips } from "./CategoryChips";
import { VehicleModeToggle } from "./VehicleModeToggle";
import { NumberStepper } from "../ui/NumberStepper";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { useEffect, useState } from "react";
import { MAX_CUSTOM_STOPS, POI_CATEGORIES } from "@/lib/constants";
import { UseRoutePlannerReturn } from "@/hooks/useRoutePlanner";
import { useUserLocationBias } from "@/hooks/useUserLocationBias";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface RoutePlannerPanelProps {
  planner: UseRoutePlannerReturn;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isNavigating?: boolean;
}

export interface PoiCategoryDefinition {
  id: string;
  label: string;
  icon: string;
  osmKey: string;
  osmValue: string;
  color: string;
}

export function RoutePlannerPanel({
  planner,
  isCollapsed = true,
  onToggleCollapse,
  isNavigating = false,
}: RoutePlannerPanelProps) {
  const [isLocatingStart, setIsLocatingStart] = useState(false);
  const [isLocatingEnd, setIsLocatingEnd] = useState(false);
  const [gender, setGender] = useState<GenderTheme>("nam");
  // Vị trí GPS của người dùng, dùng để ưu tiên & sắp xếp gợi ý tìm kiếm địa
  // điểm theo khoảng cách gần nhất — tránh gợi ý ra nơi trùng tên ở tỉnh khác.
  const userLocation = useUserLocationBias();

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getActiveStyles = () => {
    if (gender === "nu") {
      return "bg-pink-500 text-white shadow";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 text-white shadow";
    }
    return "bg-primary text-white shadow";
  };

  const getHoverStyles = () => {
    if (gender === "nu") return "hover:bg-pink-50 hover:text-pink-500";
    if (gender === "khac") return "hover:bg-purple-50 hover:text-purple-500";
    return "hover:bg-slate-100 hover:text-slate-900";
  };

  // Kiểm tra trùng vị trí (bằng id hoặc tọa độ lat, lon)
  const isSameLocation =
    Boolean(planner.start && planner.end) &&
    (planner.start?.id === planner.end?.id ||
      (planner.start?.lat === planner.end?.lat &&
        planner.start?.lon === planner.end?.lon));

  const isCustomStopsValid =
    planner.stopMode !== "custom" ||
    (planner.customStops.length <= MAX_CUSTOM_STOPS &&
      planner.customStops.every(
        (stop) =>
          stop &&
          typeof stop.lat === "number" &&
          typeof stop.lon === "number" &&
          Boolean(stop.label),
      ));

  const canPlan =
    Boolean(planner.start && planner.end) &&
    !isSameLocation &&
    isCustomStopsValid &&
    !planner.isLoading;

  const handleAddCustomStop = () => {
    if (planner.customStops.length >= MAX_CUSTOM_STOPS) return;
    planner.addCustomStop();
  };

  const fetchCurrentLocation = (target: "start" | "end") => {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }

    if (target === "start") setIsLocatingStart(true);
    else setIsLocatingEnd(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          );
          const data = await res.json();
          const label = data.display_name || "Vị trí hiện tại của bạn";

          const placeResult = {
            id: `current-location-${target}`,
            label: `Vị trí hiện tại (${label.split(",")[0]})`,
            lat: latitude,
            lon: longitude,
          };

          if (target === "start") planner.setStart(placeResult);
          else planner.setEnd(placeResult);
        } catch {
          const placeResult = {
            id: `current-location-${target}`,
            label: `Vị trí hiện tại (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            lat: latitude,
            lon: longitude,
          };

          if (target === "start") planner.setStart(placeResult);
          else planner.setEnd(placeResult);
        } finally {
          if (target === "start") setIsLocatingStart(false);
          else setIsLocatingEnd(false);
        }
      },
      (error) => {
        if (target === "start") setIsLocatingStart(false);
        else setIsLocatingEnd(false);

        let msg = "Không thể lấy vị trí hiện tại.";
        if (error.code === error.TIMEOUT)
          msg = "Quá thời gian lấy định vị GPS.";
        if (error.code === error.PERMISSION_DENIED)
          msg = "Bạn đã từ chối cấp quyền vị trí.";
        alert(msg);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  if (isNavigating) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-8">
      {/* Nút bấm Đóng / Mở bảng điều khiển */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/85 px-4 py-1.5 text-md font-bold text-cream shadow-md backdrop-blur-md transition-all hover:bg-ink/95 active:scale-95"
        >
          <span>{isCollapsed ? "Mở bảng" : "Đóng bảng"}</span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      )}

      {/* Nội dung bảng điều khiển */}
      {!isCollapsed && (
        <>
          {/* Thanh chú thích */}
          <div className="pointer-events-auto hidden md:flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-ink/85 px-4 py-1.5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
              Chú thích:
            </span>
            {POI_CATEGORIES.map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-1.5 px-1.5 py-0.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-xs font-medium text-cream/90">
                  {category.label}
                </span>
              </div>
            ))}
          </div>

          {/* Bảng tìm đường chính */}
          <div className="pointer-events-auto max-h-[70vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-ink/10 bg-ink/85 p-4 shadow-xl backdrop-blur-md transition-all scrollbar-none sm:max-h-none sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <PlaceAutocompleteInput
                label="Điểm xuất phát"
                placeholder="Điểm bắt đầu"
                value={planner.start}
                onSelect={planner.setStart}
                onUseCurrentLocation={() => fetchCurrentLocation("start")}
                isLocating={isLocatingStart}
                dropdownPlacement="bottom"
                userLocation={userLocation}
              />
              <PlaceAutocompleteInput
                label="Điểm kết thúc"
                placeholder="Điểm kết thúc"
                value={planner.end}
                onSelect={planner.setEnd}
                onUseCurrentLocation={() => fetchCurrentLocation("end")}
                isLocating={isLocatingEnd}
                dropdownPlacement="bottom"
                userLocation={userLocation}
              />
              {/* {planner.stopMode === "auto" && (
                <NumberStepper
                  label="Số điểm dừng"
                  value={planner.stopCount}
                  onChange={planner.setStopCount}
                />
              )} */}
              {/* Khối chọn Loại xe & Giao thông cùng 1 hàng ngang trên Mobile */}
              {/* Khối chọn Số điểm dừng (nếu auto), Loại xe & Giao thông */}
              <div className="grid grid-cols-12 gap-2 sm:flex sm:items-end sm:gap-3">
                {planner.stopMode === "auto" && (
                  <div className="col-span-4 sm:col-span-auto">
                    <NumberStepper
                      label="Số điểm dừng"
                      value={planner.stopCount}
                      onChange={planner.setStopCount}
                    />
                  </div>
                )}

                <div
                  className={
                    planner.stopMode === "auto" ? "col-span-5" : "col-span-8"
                  }
                >
                  <VehicleModeToggle
                    label="Loại xe"
                    avoidHighways={planner.avoidHighways}
                    onChange={planner.setAvoidHighways}
                  />
                </div>

                <div
                  className={`${
                    planner.stopMode === "auto" ? "col-span-3" : "col-span-4"
                  } flex flex-col justify-end`}
                >
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-cream/50 truncate">
                    Giao thông
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      planner.setAvoidTraffic(!planner.avoidTraffic)
                    }
                    className={`h-[44px] w-full rounded-2xl text-xs font-semibold transition flex items-center justify-center gap-1 px-2 ${
                      planner.avoidTraffic
                        ? getActiveStyles()
                        : `bg-black/20 text-cream/90 ${getHoverStyles()}`
                    }`}
                  >
                    <span>{planner.avoidTraffic ? "Bật" : "Tắt"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Thông báo lỗi khi điểm đi và điểm đến bị trùng nhau */}
            {isSameLocation && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300">
                <svg
                  className="h-4 w-4 shrink-0 text-rose-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>
                  Điểm xuất phát và điểm kết thúc trùng nhau. Vậy kiếm đường chi
                  má!
                </span>
              </div>
            )}

            <div className="flex min-w-[180px] flex-col gap-1.5">
              <span className="pt-5 text-[10px] font-bold uppercase tracking-wide text-cream/50">
                Kiểu điểm dừng
              </span>
              <div className="flex rounded-2xl border border-ink/10 bg-black/20 p-1 gap-2">
                <button
                  type="button"
                  onClick={() => planner.setStopMode("auto")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    planner.stopMode === "auto"
                      ? getActiveStyles()
                      : `bg-transparent text-cream/90 ${getHoverStyles()}`
                  }`}
                >
                  Tự chia đều
                </button>
                <button
                  type="button"
                  onClick={() => planner.setStopMode("custom")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    planner.stopMode === "custom"
                      ? getActiveStyles()
                      : `bg-transparent text-cream/90 ${getHoverStyles()}`
                  }`}
                >
                  Tự chọn
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CategoryChips
                label="Danh mục"
                selected={planner.selectedCategories}
                onToggle={planner.toggleCategory}
              />

              {planner.stopMode === "custom" && (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">
                      Điểm dừng tùy chỉnh ({planner.customStops.length}/
                      {MAX_CUSTOM_STOPS})
                    </span>
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={planner.customStops.length >= MAX_CUSTOM_STOPS}
                      onClick={handleAddCustomStop}
                      className="border border-amber-500/30 bg-black/20 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Thêm điểm dừng
                    </Button>
                  </div>

                  {planner.customStops.length >= MAX_CUSTOM_STOPS && (
                    <p className="mb-2 text-xs text-amber-400 font-medium">
                      Đã đạt giới hạn tối đa {MAX_CUSTOM_STOPS} điểm dừng tùy
                      chỉnh.
                    </p>
                  )}

                  <div className="relative z-40 flex max-h-40 flex-col gap-3 overflow-y-auto overflow-x-hidden pb-6">
                    {planner.customStops.map((stop, index) => (
                      <div
                        key={`${stop.id}-${index}`}
                        className="flex items-end gap-2"
                      >
                        <PlaceAutocompleteInput
                          label={`Điểm dừng ${index + 1}`}
                          placeholder="Tìm địa điểm muốn ghé…"
                          value={stop?.lat && stop?.lon ? stop : null}
                          onSelect={(place) =>
                            planner.updateCustomStop(index, place)
                          }
                          dropdownPlacement="bottom"
                          userLocation={userLocation}
                        />
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => planner.removeCustomStop(index)}
                          className="mb-0 border border-red-500/30 bg-black/20 text-red-400 hover:bg-red-500/20"
                        >
                          Xóa
                        </Button>
                      </div>
                    ))}

                    {planner.customStops.length === 0 && (
                      <p className="text-xs text-amber-300/80">
                        Bạn có thể thêm bằng ô tìm kiếm ở đây hoặc chuột phải
                        trên bản đồ rồi chọn “Thêm điểm dừng”.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Loading modal - chỉ hiện trên Mobile */}
              {planner.isLoading && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm sm:hidden">
                  <div className="flex w-[180px] flex-col items-center justify-center gap-3 rounded-2xl bg-ink/95 px-6 py-5 shadow-2xl">
                    <LoadingSpinner label="Đang tính lộ trình…" />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end lg:pt-0">
                {/* Loading bên ngoài - chỉ hiện Desktop */}
                {planner.isLoading && (
                  <div className="hidden w-auto items-center justify-center sm:flex">
                    <LoadingSpinner label="Đang tính lộ trình…" />
                  </div>
                )}

                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={planner.reset}
                    className="flex-1 border border-ink/10 bg-black/20 text-cream/90 hover:bg-white/10 sm:flex-initial"
                  >
                    Đặt lại
                  </Button>

                  <Button
                    variant="primary"
                    type="button"
                    disabled={!canPlan}
                    onClick={() => void planner.planTrip()}
                    className="flex-1 sm:flex-initial"
                  >
                    Bắt đầu
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
