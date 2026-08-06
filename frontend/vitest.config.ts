import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest 测试配置：与 vite.config.ts 分离，避免开发服务器配置影响测试
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
