/**
 * Signature visual for the landing page: a winding route line that glows in and
 * has a small marker continuously traveling along it — a visual metaphor for
 * "a journey being planned," tying directly back to what MyGoMap actually does.
 */
export function HeroRouteLine() {
  return (
    <svg
      viewBox="0 0 1200 400"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF6A1A" stopOpacity="0" />
          <stop offset="15%" stopColor="#FF6A1A" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#FFC24B" stopOpacity="0.9" />
          <stop offset="85%" stopColor="#FF6A1A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF6A1A" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        id="heroRoutePath"
        d="M -50 320 C 150 320, 200 120, 380 140 S 620 320, 780 260 S 980 80, 1250 120"
        fill="none"
        stroke="url(#routeGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="10 10"
        className="animate-route-dash"
      />

      <circle r="6" fill="#FFC24B" className="drop-shadow-[0_0_8px_rgba(255,194,75,0.9)]">
        <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
          <mpath href="#heroRoutePath" />
        </animateMotion>
      </circle>
    </svg>
  );
}
