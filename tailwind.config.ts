import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#20261f',
        inksoft: '#5c6659',
        bg: '#f4f2ea',
        panel: '#ffffff',
        panelalt: '#f0efe6',
        line: '#e2e0d3',
        verde: '#2f6d4f',
        verdesoft: '#e4efe8',
        rojo: '#8a3324',
        rojosoft: '#f6e7e3',
        ocre: '#b3831f',
        ocresoft: '#f5ecd8',
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
        body: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
