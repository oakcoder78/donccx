/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        donc: {
          navy:    '#173557',
          sky:     '#59c2ed',
          lime:    '#d3da47',
          verde:   '#1D9E75',
          amber:   '#BA7517',
          red:     '#E24B4A',
          purple:  '#534AB7',
          blue:    '#185FA5',
          hubspot: '#0091AE',
        },
        bg: {
          primary:   '#ffffff',
          secondary: '#f7f7f5',
          tertiary:  '#f0efed',
        },
        border: {
          tertiary:  '#e8e7e3',
          secondary: '#d4d3ce',
        },
        text: {
          primary:   '#1a1a18',
          secondary: '#4a4a46',
          tertiary:  '#888780',
        },
      },
      borderRadius: {
        lg: '10px',
        md: '7px',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
