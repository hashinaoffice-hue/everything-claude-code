import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'path';

export default defineConfig({
  base: '/everything-claude-code/hand-gesture-3d/',
  plugins: [glsl(), basicSsl()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    https: {},
  },
});
