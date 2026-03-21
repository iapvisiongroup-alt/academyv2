/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        'app-bg': '#050505',
        'panel-bg': '#0a0a0a',
        'card-bg': '#111111',
        primary: '#d9ff00',
      },
    },
  },
  plugins: [],
}
