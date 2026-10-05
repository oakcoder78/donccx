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
        // Estados do faturamento: texto escuro (>= 4,5:1 sobre branco, para
        // text-xs), fundo suave e linha. Cor nunca e a unica informacao: cada
        // estado tambem tem texto e icone. Amber = acao; green so quitada.
        status: {
          'amber-text': '#633806',
          'amber-bg':   '#FAEEDA',
          'amber-line': '#FAC775',
          'red-text':   '#791F1F',
          'red-bg':     '#FCEBEB',
          'red-line':   '#F7C1C1',
          'red-solid':  '#A32D2D',
          'green-text': '#085041',
          'green-bg':   '#E1F5EE',
          'green-line': '#9FE1CB',
          'blue-text':  '#0C447C',
          'blue-bg':    '#E6F1FB',
          'blue-line':  '#B5D4F4',
          'slate-text': '#444441',
          'slate-bg':   '#F1EFE8',
          'slate-line': '#D3D1C7',
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
