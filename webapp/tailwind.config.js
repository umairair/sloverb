/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#1e2124"

      },
      keyframes: {
        epicFloat: {
          "0%, 100%": {
            transform: "translateY(0px) translateX(0px) scale(1)",
          },
          "25%": {
            transform: "translateY(-12px) translateX(5px) scale(1.03)",
          },
          "50%": {
            transform: "translateY(8px) translateX(-7px) scale(0.98)",
          },
          "75%": {
            transform: "translateY(-5px) translateX(3px) scale(1.02)",
          },
        },
      }
    },
  },
  plugins: [],
};