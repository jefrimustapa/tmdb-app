import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig(() => {
  const pkgPath = path.resolve(__dirname, './package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/tmdb-app/' : './',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_NUMBER__: JSON.stringify(pkg.buildNumber || 1),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: true,
    },
  };
});
