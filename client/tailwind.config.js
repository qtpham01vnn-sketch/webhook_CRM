/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#e9f7ff',
        muted: '#9bb6cb',
        canvas: '#061425',
        brand: {
          50: '#0b3149',
          100: '#0e4660',
          500: '#22d3ee',
          600: '#06b6d4',
          700: '#0891b2'
        },
        slate: {
          50: '#0b2540',
          100: '#113451',
          200: '#1b4563',
          300: '#2a5875',
          400: '#78a0b9',
          500: '#96b8cb',
          600: '#b2cad9',
          700: '#c6dae7',
          800: '#e1eff7',
          900: '#f3fbff',
          950: '#020b18'
        },
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(34, 211, 238, 0.12), 0 16px 40px rgba(0, 0, 0, 0.28), 0 0 28px rgba(34, 211, 238, 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
