import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "rgb(var(--brand) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        flash: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "25%": { opacity: "0.35", transform: "scale(1.04)" },
          "50%": { opacity: "1", transform: "scale(1)" },
          "75%": { opacity: "0.35", transform: "scale(1.04)" },
        },
      },
      animation: { flash: "flash 1.6s ease-in-out" },
    },
  },
  plugins: [],
} satisfies Config;
