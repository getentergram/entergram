import type { Config } from "tailwindcss";

// Palette continues the marketing site's tokens (web/tailwind.config.ts) so the
// product reads as one thing, extended with the depth layers a dark canvas needs.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",
        panel: "#12121a",
        panel2: "#191924",
        edge: "#262633",
        accent: "#7c6cff",
        accent2: "#4dd0e1",
        muted: "#8b8b9e",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        glow: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
        rise: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        glow: "glow 2.4s ease-in-out infinite",
        rise: "rise .18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
