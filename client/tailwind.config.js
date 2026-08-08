/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172e3d',
        muted: '#60717c',
        canvas: '#f4f6f8',
        brand: {
          50: '#ecfdf8',
          100: '#d1faee',
          500: '#22b98a',
          600: '#129e74',
          700: '#0f7f60'
        }
      },
      boxShadow: {
        panel: '0 1px 2px rgba(16, 24, 40, 0.03), 0 8px 24px rgba(16, 24, 40, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

