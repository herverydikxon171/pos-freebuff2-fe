import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Dev: Vite proxy menjaga same-origin agar Sanctum cookie auth jalan tanpa CORS.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/sanctum': 'http://127.0.0.1:8000',
      '/storage': 'http://127.0.0.1:8000',
    },
  },
})
