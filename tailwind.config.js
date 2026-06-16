/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#17202a",
        fog: "#eef7f1",
        teal: "#04756f",
        coral: "#d93d4a",
        amber: "#e09b2d",
        violet: "#6157a8",
      },
      boxShadow: {
        glass: "0 24px 70px rgba(23, 32, 42, 0.18)",
        lift: "0 18px 38px rgba(4, 117, 111, 0.22)",
      },
    },
  },
  plugins: [],
};
