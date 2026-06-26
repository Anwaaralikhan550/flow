import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f6f2ff",
        smoke: "#a7a0b8",
        void: "#05040a",
        obsidian: "#090814",
        panel: "#0f0d1d",
        line: "rgba(255,255,255,0.12)",
        violet: "#a855f7",
        electric: "#5d7cff",
        cyan: "#47d7ff",
      },
      boxShadow: {
        glow: "0 0 55px rgba(168, 85, 247, 0.28)",
        card: "0 24px 80px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "radial-violet": "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.22), transparent 34%)",
      },
    },
  },
  plugins: [],
};

export default config;
