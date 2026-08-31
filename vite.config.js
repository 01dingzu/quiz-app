import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base: './' —— GH Pages 子路径部署（相对路径 + hash 路由）
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist',
    },
});
