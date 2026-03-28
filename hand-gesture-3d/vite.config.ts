import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'path';

const noSsl = process.env.VITE_NO_SSL === '1';
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProd ? '/everything-claude-code/hand-gesture-3d/' : '/',
  plugins: [glsl(), ...(noSsl ? [] : [basicSsl()])],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    ...(noSsl ? {} : { https: {} }),
  },
});
