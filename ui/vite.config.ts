import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is overridden by SPECTR_BASE for GitHub Pages builds (e.g. /spectr/)
export default defineConfig({
  plugins: [react()],
  base: process.env.SPECTR_BASE || '/',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
