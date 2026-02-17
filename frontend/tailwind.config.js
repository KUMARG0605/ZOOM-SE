/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'zoom-blue': '#2D8CFF',
        'zoom-dark': '#1F2937',
      }
    },
  },
  plugins: [],
}
