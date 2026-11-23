import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Override with VITE_API_TARGET to point at an API on another port.
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
