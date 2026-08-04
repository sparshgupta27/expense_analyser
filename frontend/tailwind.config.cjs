/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: '#12121a',
          hover: '#1a1a28',
        },
        slate: {
          950: '#0a0a0f',
          900: '#12121a',
          850: '#161624',
          800: '#1a1a2e',
          700: '#252540',
        },
        indigo: {
          500: '#818cf8',
          600: '#6366f1',
        },
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [],
};
