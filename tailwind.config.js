/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        app: {
          primary: '#6366f1',
          'primary-dark': '#4f46e5',
          header: '#1e293b',
          'header-hover': 'rgba(255,255,255,0.08)',
          surface: '#f1f5f9',
          selected: '#e0e7ff',
        },
      },
      boxShadow: {
        'chat': '0 1px 2px rgba(0,0,0,0.04)',
        'modal': '0 20px 50px -12px rgba(0,0,0,0.18)',
        'input': '0 0 0 2px rgba(99,102,241,0.25)',
      },
    },
  },
  plugins: [],
}
