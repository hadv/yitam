import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'csp-html-transform',
      transformIndexHtml(html) {
        // Only add CSP meta tag for production builds
        if (mode === 'production') {
          const cspContent = "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";
          
          return html.replace(
            /<\/head>/,
            `  <meta http-equiv="Content-Security-Policy" content="${cspContent}">\n  </head>`
          );
        }
        return html;
      }
    }
  ],
  server: {
    port: 3000,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true,
      },
    },
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss: ws:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    }
  },
  build: {
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
      },
    },
  },
})); 