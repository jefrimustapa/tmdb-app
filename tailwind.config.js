/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hbo: {
          dark: '#050508',
          card: '#0e0e17',
          hover: '#191928',
          border: '#23233a',
          purple: '#673ab7',
          'purple-light': '#9055ff',
          'purple-dark': '#3a187a',
          cyan: '#00d2ff',
          magenta: '#e024c3',
          glow: 'rgba(144, 85, 255, 0.4)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'hbo-gradient': 'linear-gradient(135deg, #673ab7 0%, #9055ff 50%, #00d2ff 100%)',
        'hbo-hero': 'linear-gradient(to top, #050508 10%, rgba(5,5,8,0.8) 50%, rgba(5,5,8,0.2) 100%)',
        'hbo-card-gradient': 'linear-gradient(180deg, rgba(20,20,35,0) 0%, rgba(14,14,23,0.95) 80%)',
      },
      boxShadow: {
        'hbo-glow': '0 0 25px -5px rgba(144, 85, 255, 0.5)',
        'hbo-cyan-glow': '0 0 25px -5px rgba(0, 210, 255, 0.5)',
        'tv-focus': '0 0 0 4px #9055ff, 0 0 25px rgba(144, 85, 255, 0.8)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
