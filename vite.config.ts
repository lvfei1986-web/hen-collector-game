import { defineConfig } from 'vite';

export default defineConfig({
  // 使用相对路径：VibeHub 等平台将作品托管在子目录下，绝对路径会导致资源 404
  base: './',
  server: {
    port: 5173,
    open: false,
    // 开发环境下将 /api 请求代理到后端服务
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
