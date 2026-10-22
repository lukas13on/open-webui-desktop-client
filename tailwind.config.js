/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './ui/**/*.{vue,ts}'],
  theme: { extend: { colors: { brand: '#D94F55', ink: '#0F0F11', panel: '#18181B' } } },
  plugins: []
};
