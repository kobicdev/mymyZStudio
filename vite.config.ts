import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
// Vite는 React 렌더러만 담당.
// Electron main/preload는 tsc로 별도 빌드 (tsconfig.electron.json)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
  },
  base: './',  // Electron file:// 프로토콜 호환
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
