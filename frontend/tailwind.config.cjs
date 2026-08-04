/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#FAF8F3',
          card: '#FFFFFF',
          muted: '#F5F2EA',
          border: '#E8E3D8',
        },
        ink: {
          DEFAULT: '#1C1B19',
          muted: '#6C6A65',
          light: '#8C8A83',
        },
        ledger: {
          green: '#2D5C4E',
          light: '#EBF3F0',
        },
        brick: {
          red: '#B33F3F',
          light: '#FBF0F0',
        },
        gold: {
          accent: '#C9A961',
          text: '#8C6D23',
          light: '#FAF5EA',
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        lg: '10px',
        md: '6px',
        sm: '4px',
      },
    },
  },
  plugins: [],
};
