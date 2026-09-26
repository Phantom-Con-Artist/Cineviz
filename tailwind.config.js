/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        workstation: {
          950: '#07080a',
          900: '#0c0e12',
          850: '#11141a',
          800: '#171b22',
          750: '#1e232d',
          700: '#282f3c',
          600: '#3b4557',
          accent: '#e11d48',
          accentHover: '#f43f5e',
          cyan: '#06b6d4',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      aspectRatio: {
        '16/9': '16 / 9',
      }
    },
  },
  plugins: [],
};
