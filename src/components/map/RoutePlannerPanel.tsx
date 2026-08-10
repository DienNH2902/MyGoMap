'use client';

import { PlaceAutocompleteInput } from './PlaceAutocompleteInput';
import { CategoryChips } from './CategoryChips';
import { NumberStepper } from '../ui/NumberStepper';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import type { UseRoutePlannerReturn } from '@/hooks/useRoutePlanner';

interface RoutePlannerPanelProps {
  planner: UseRoutePlannerReturn;
}

/**
 * Bottom control panel — the main way the user drives the app: search for an
 * origin and a destination, choose how many stops to make, pick which kinds
 * of places to look for, then start the trip or reset everything.
 */
export function RoutePlannerPanel({ planner }: RoutePlannerPanelProps) {
  const canPlan = Boolean(planner.start && planner.end) && !planner.isLoading;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
      <div className="w-full max-w-4xl rounded-3xl border border-ink/10 bg-white/95 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <PlaceAutocompleteInput
            label="Điểm xuất phát"
            placeholder="Nhập địa điểm bắt đầu…"
            value={planner.start}
            onSelect={planner.setStart}
          />
          <PlaceAutocompleteInput
            label="Điểm kết thúc"
            placeholder="Tìm nơi cần đến…"
            value={planner.end}
            onSelect={planner.setEnd}
          />
          <NumberStepper label="Số điểm dừng" value={planner.stopCount} onChange={planner.setStopCount} />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryChips selected={planner.selectedCategories} onToggle={planner.toggleCategory} />

          <div className="flex items-center gap-2">
            {planner.isLoading && <LoadingSpinner label="Đang tính lộ trình…" />}
            <Button variant="ghost" type="button" onClick={planner.reset} className="border border-ink/10">
              Đặt lại
            </Button>
            <Button variant="primary" type="button" disabled={!canPlan} onClick={() => void planner.planTrip()}>
              Bắt đầu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
