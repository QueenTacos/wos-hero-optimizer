import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./preview/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        infantry: "#3b82f6", // blue
        lancer: "#f59e0b", // amber
        marksman: "#22c55e", // green
      },
    },
  },
  plugins: [],
};

export default config;
