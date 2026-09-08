import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// synclounge-libjass uses `var global = this` in its IIFE wrapper.
// In ESM strict mode, `this` is undefined, so `global` becomes undefined
// and the library crashes accessing `global.Set`. Patch it at build time.
function patchLibjassPlugin() {
  return {
    name: 'patch-libjass',
    transform(code, id) {
      if (id.includes('synclounge-libjass')) {
        return code.replace('var global = this;', 'var global = globalThis;');
      }
      return undefined;
    },
  };
}

export function generateConfigPlugin({
  configModule = require('./config'),
  configFile = 'public/config.json',
  loadConfig = () => configModule.get(null),
} = {}) {
  return {
    name: 'generate-config',
    buildStart() {
      // Generate from defaults/environment every time. Reading the previous generated file here
      // made local builds stateful and allowed stale keys to leak into later images.
      const appConfig = loadConfig();
      configModule.save(configModule.getPublic(appConfig), configFile);
    },
  };
}

export function generatePwaPlugin({
  readFile = (file) => fs.readFileSync(path.join(__dirname, file)),
} = {}) {
  return {
    name: 'synclounge-offline-worker',
    generateBundle(options, bundle) {
      const worker = readFile('src/pwa/service-worker.js').toString();
      const hash = createHash('sha256').update(worker);
      const hashFile = (name, source) => {
        const bytes = Buffer.from(source);
        hash.update(`${name.length}:${name}${bytes.length}:`).update(bytes);
      };
      for (const asset of [
        'index.html', 'public/manifest.webmanifest', 'public/offline.html',
        'public/offline.css', 'public/offline-report.js', 'public/icons/icon-192.png', 'public/icons/icon.svg',
      ]) {
        hashFile(asset, readFile(asset));
      }
      // CSS and metadata can change without a JavaScript change. File names and
      // stable ordering also make renames visible without depending on plugin order.
      for (const fileName of Object.keys(bundle).sort()) {
        const source = bundle[fileName];
        hashFile(fileName, source.type === 'chunk' ? source.code : source.source);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: worker.replace('__SL_CACHE_NAME__', `synclounge-offline-${hash.digest('hex').slice(0, 16)}`),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    {
      name: 'cast-receiver-assets',
      generateBundle() {
        for (const [fileName, modulePath] of [
          ['cast-vendor/mux.min.js', 'cast-mux.js/dist/mux.min.js'],
          ['cast-vendor/shaka-player.compiled.js', 'shaka-player/dist/shaka-player.compiled.js'],
        ]) {
          this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(require.resolve(modulePath)) });
        }
      },
    },
    generatePwaPlugin(),
    patchLibjassPlugin(),
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
      process.env.VERSION || require('./package.json').version,
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
