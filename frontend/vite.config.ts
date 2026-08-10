import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 本地开发时将 /api 请求转发到 Express 后端（backend/server.js）
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})