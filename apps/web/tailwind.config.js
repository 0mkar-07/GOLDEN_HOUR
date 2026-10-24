/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#F6F8F8',
        surface: '#FFFFFF',
        teal: {
          brand: '#176B68',
          deep: '#174C49',
          light: '#EAF5F2',
          hover: '#135552',
        },
        text: {
          main: '#172B2A',
          muted: '#596B69',
          subtle: '#889B99',
        },
        border: {
          subtle: '#DCE5E3',
          DEFAULT: '#DCE5E3',
        },
        alert: {
          critical: '#B42318',
          warning: '#8A5800',
          success: '#237048',
        },
        brand: {
          50: '#EAF5F2',
          100: '#D5ECE7',
          500: '#176B68',
          600: '#174C49',
          700: '#0F3331',
        },
        slate: {
          850: '#151e2e',
          900: '#0f172a',
          950: '#020617',
        }
      }
    },
  },
  plugins: [],
}
