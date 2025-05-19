/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            blockquote: {
              borderLeftColor: '#5D4A38',
              borderLeftWidth: '4px',
              backgroundColor: '#F7F5F0',
              borderRadius: '0 0.375rem 0.375rem 0',
              padding: '1rem 1.5rem 1rem 1.5rem',
              margin: '1.5rem 0',
              color: '#3A2E22',
              fontStyle: 'normal',
              position: 'relative',
              '&::before': {
                position: 'absolute',
                left: '0.25rem',
                top: '-0.5rem',
                color: '#5D4A38',
                opacity: '0.4',
              },
              'p:first-of-type': {
                marginTop: '0',
              },
              'p:last-of-type': {
                marginBottom: '0',
              }
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} 