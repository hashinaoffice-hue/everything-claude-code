import { createServer } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.VITE_NO_SSL = '1';

const server = await createServer({
  configFile: resolve(__dirname, 'vite.config.ts'),
  root: __dirname,
  server: { port: 5173, host: true },
});

await server.listen();
server.printUrls();
