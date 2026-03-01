import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function generateConfigPlugin() {
  return {
    name: 'generate-config',
    buildStart() {
      const config = require('./config');
      const configFile = 'public/config.json';
      const appConfig = config.get(configFile);
      console.log(appConfig);
      config.save(appConfig, configFile);
    },
  };
}

const pkg = require('./package.json');

export default defineConfig({
  plugins: [
    generateConfigPlugin(),
    vue({
      template: {
        transformAssetUrls: {
          // defaults
          video: ['src', 'poster'],
          source: ['src', 'srcset'],
          img: ['src', 'srcset'],
          image: ['xlink:href', 'href'],
          use: ['xlink:href', 'href'],
          // Vuetify components
          'v-img': ['src'],
          'v-card': ['image', 'img'],
        },
      },
    }),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VERSION || pkg.version,
    ),
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.js'],
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
    css: true,
  },
});
