import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Simplified configuration for React 19 compatibility
      fastRefresh: true
    }),
    // Only add CSP plugin in production mode
    ...(mode === 'production' ? [{
      name: 'csp-html-transform',
      transformIndexHtml(html) {
        const cspContent = "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";

        return html.replace(
          /<\/head>/,
          `  <meta http-equiv="Content-Security-Policy" content="${cspContent}">\n  </head>`
        );
      }
    }] : [])
  ],
  server: {
    port: 3001,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
    // Override any CSP with a permissive one for development
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src * ws: wss:; frame-src *;"
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