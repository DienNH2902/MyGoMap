import type { RouteGeometry, RouteStop } from '@/lib/types';

interface RouteStatsBarProps {
  route: RouteGeometry;
  stops: RouteStop[];
}

/** Formats a minute count as "X giờ Y phút" or just "Y phút" when under an hour. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours === 0 ? `${mins} phút` : `${hours} giờ ${mins} phút`;
}

/** Floating stat cards summarizing the current trip: total distance, ETA, and stop count. */
export function RouteStatsBar({ route, stops }: RouteStatsBarProps) {
  const stats = [
    { label: 'Tổng quãng đường', value: `${route.distanceKm.toFixed(1)} km` },
    { label: 'Thời gian ước tính', value: formatDuration(route.durationMinutes) },
    { label: 'Điểm dừng', value: `${stops.length} điểm` },
  ];

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col gap-2 sm:flex-row">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="pointer-events-auto rounded-2xl border border-white/10 bg-ink/85 px-4 py-2.5 shadow-xl backdrop-blur-md"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-cream/50">{stat.label}</p>
          <p className="font-mono text-lg font-bold text-accent-gold">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
