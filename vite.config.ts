import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiMiddleware } from './server/api.mjs'

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; local dev and `npm start` use /
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'study-schema-api',
      configureServer(server) {
        server.middlewares.use(apiMiddleware())
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware())
      },
    },
  ],
  server: { host: '127.0.0.1' },
})
