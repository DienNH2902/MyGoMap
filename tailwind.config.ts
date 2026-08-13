import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep warm-black used for the header and hero — the "luxury" anchor color.
        ink: "#140F0C",
        // Core brand orange.
        primary: "#FF6A1A",
        "primary-light": "#FF9142",
        // Warm gold accent used for highlights, active states, and the AI tip banner.
        "accent-gold": "#FFC24B",
        // Warm off-white used for text on dark surfaces.
        cream: "#FFF6EC",
        surface: "#FFFFFF",
        "surface-muted": "#FFF1E2",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 30px rgba(255, 106, 26, 0.35)",
      },
      keyframes: {
        "route-dash": {
          to: { strokeDashoffset: "-200" },
        },
        "peek-cat": {
          // Khi ẩn hoàn toàn: nghiêng -12 độ
          "0%, 100%": { transform: "translateX(100%) rotate(-12deg)" },

          // Khi thò ra lấp ló: giảm nghiêng còn -6 độ
          "10%, 30%": { transform: "translateX(35%) rotate(-70deg)" },

          // Khi thụt vào lại: quay về nghiêng -12 độ
          "40%": { transform: "translateX(100%) rotate(-12deg)" },
        },
      },
      animation: {
        "route-dash": "route-dash 6s linear infinite",
        "peek-cat": "peek-cat 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
