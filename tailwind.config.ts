import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        nearblack: "#0A0A0A",
        panel: "#101010",
        input: "#111111",
        // Text
        softwhite: "#FAFAFA",
        mutedtext: "#EEEEEE",
        // Borders
        edge: "#171717",
        edge2: "#121212",
        // Accents — NOTE: `plum*` token names kept for wide usage, but values
        // are now the VIOLET ramp (bold gradient + glow direction).
        plum: "#6D28D9", // violet-700 (deep base / solid fills)
        plumborder: "#8B5CF6", // violet-500 (bright accent / border / text)
        aubergine: "#4C1D95", // violet-900
        plum2: "#7C3AED", // violet-600
        accent: "#D946EF", // fuchsia-500 (gradient partner / glow)
        accent2: "#22D3EE", // cyan-400 (tertiary highlight)
      },
      borderRadius: {
        micro: "8px",
        card: "15px",
        field: "17px",
        pill: "999px",
      },
      fontFamily: {
        sans: ["Satoshi", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1120px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,.35), 0 10px 40px -12px rgba(124,58,237,.6)",
        glowLg:
          "0 20px 90px -20px rgba(217,70,239,.55), 0 0 60px -20px rgba(124,58,237,.7)",
        card: "0 1px 0 0 rgba(255,255,255,.05) inset",
      },
      backgroundImage: {
        brandgrad:
          "linear-gradient(135deg,#8B5CF6 0%,#D946EF 55%,#22D3EE 120%)",
        plumradial:
          "radial-gradient(60% 60% at 50% 0%, rgba(124,58,237,.35), transparent 70%)",
        grid: "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(-8px)" },
          "50%": { transform: "translateY(8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        gradientx: {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        pulseglow: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        gradientpan: {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        particle: {
          "0%,100%": { transform: "translateY(-10px)", opacity: "0.35" },
          "50%": { transform: "translateY(10px)", opacity: "0.9" },
        },
        kenburns: {
          "0%,100%": { transform: "scale(1.06) translate(0, 0)" },
          "50%": { transform: "scale(1.14) translate(-1.5%, -1%)" },
        },
        // Template motion recipes (lib/template-recipes.ts). Every one of them is
        // transform/filter only and starts above scale(1), so the drifting layer
        // always covers the frame — a pan that reached scale(1) would show the
        // black page through the edges.
        "fx-drift-up": {
          "0%,100%": { transform: "scale(1.08) translate3d(0, 1.5%, 0)" },
          "50%": { transform: "scale(1.12) translate3d(0, -1.5%, 0)" },
        },
        "fx-pan-x": {
          "0%": { transform: "scale(1.08) translate3d(-2%, 0, 0)" },
          "50%": { transform: "scale(1.1) translate3d(2%, 0, 0)" },
          "100%": { transform: "scale(1.08) translate3d(-2%, 0, 0)" },
        },
        "fx-push": {
          "0%,100%": { transform: "scale(1.05) translate3d(0, 0, 0)" },
          "45%": { transform: "scale(1.16) translate3d(1%, -1%, 0)" },
        },
        "fx-orbit": {
          "0%": { transform: "scale(1.1) rotate(-1.2deg)" },
          "50%": { transform: "scale(1.16) rotate(1.2deg)" },
          "100%": { transform: "scale(1.1) rotate(-1.2deg)" },
        },
        "fx-breathe": {
          "0%,100%": { transform: "scale(1.07)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.1)", filter: "brightness(1.12)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "gradient-x": "gradientx 8s ease infinite",
        "pulse-glow": "pulseglow 3s ease-in-out infinite",
        "gradient-pan": "gradientpan 12s ease infinite",
        particle: "particle 7s ease-in-out infinite",
        "ken-burns": "kenburns 22s ease-in-out infinite",
        "fx-drift-up": "fx-drift-up 26s ease-in-out infinite",
        "fx-pan-x": "fx-pan-x 30s ease-in-out infinite",
        "fx-push": "fx-push 18s ease-in-out infinite",
        "fx-orbit": "fx-orbit 34s ease-in-out infinite",
        "fx-breathe": "fx-breathe 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
