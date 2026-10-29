/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#08090d',
          800: '#101116',
          700: '#14161c',
          600: '#1b1e26',
          500: '#242731',
        },
      },
    },
  },
  plugins: [],
}
