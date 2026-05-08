import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages the site is served from /<repo>/, so prod builds need
// that as the asset base. Local dev keeps '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/claude-decode/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
}))
