/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Màu trạng thái bàn
        'table-available': '#22c55e',
        'table-reserved':  '#f59e0b',
        'table-occupied':  '#ef4444',
        'table-blocked':   '#9ca3af',
      },
    },
  },
  plugins: [],
};
