/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0F1115',
        surface: '#171A21',
        border: '#262B36',
        textMain: '#E8EAED',
        textMuted: '#A0A3BD',
        positive: '#14C784',
        negative: '#FF4D4F',
        accent: '#4C7DFF',
        warning: '#FF9F1C',
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
