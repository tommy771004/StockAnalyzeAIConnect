/**
 * scripts/build-electron.mjs
 *
 * Compiles:
 *   main.ts    → dist-electron/main.cjs
 *   preload.ts → dist-electron/preload.cjs
 *
 * Key fix: yahoo-finance2 ships ESM test files that import Deno-only packages
 * (@std/testing/mock, @gadicc/fetch-mock-cache, etc.).
 * esbuild tries to bundle them and fails.
 * Solution: mark those test-only packages as external so esbuild skips them.
 * They are never actually called at runtime — only in Deno test suites.
 */
import { build }         from 'esbuild';
import { fileURLToPath } from 'url';
import path              from 'path';
import fs                from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Verify source files exist
for (const name of ['main.ts', 'preload.ts']) {
  if (!fs.existsSync(path.join(ROOT, name))) {
    console.error(`\n❌  ${name} not found in project root\n`);
    process.exit(1);
  }
}

fs.mkdirSync(path.join(ROOT, 'dist-electron'), { recursive: true });

/** Packages that must NEVER be bundled */
const EXTERNAL = [
  // Electron — provided at runtime
  'electron',

  // yahoo-finance2 Deno/test-only imports — not needed at runtime
  '@std/testing/mock',
  '@std/testing/bdd',
  '@std/testing',
  '@gadicc/fetch-mock-cache',
  '@gadicc/fetch-mock-cache/runtimes/deno.ts',
  '@gadicc/fetch-mock-cache/stores/fs.ts',
  '@gadicc/fetch-mock-cache/runtimes/node.js',
  '@gadicc/fetch-mock-cache/stores/fs.js',

  // Node built-ins (already available in Electron's Node runtime)
  'fs', 'path', 'http', 'https', 'os', 'crypto', 'stream', 'url',
  'util', 'events', 'buffer', 'child_process', 'net', 'tls', 'zlib',
];

const shared = {
  bundle:    true,
  platform:  'node',
  target:    'node20',
  format:    'cjs',
  external:  EXTERNAL,
  sourcemap: true,
  minify:    false,
  loader:    { '.ts': 'ts' },
  absWorkingDir: ROOT,

  // Silence "Can't bundle dynamic require" warnings from yahoo-finance2 internals
  logLevel: 'warning',
};

console.log('\n🔨  main.ts → dist-electron/main.cjs');
await build({
  ...shared,
  entryPoints: [path.join(ROOT, 'main.ts')],
  outfile:     path.join(ROOT, 'dist-electron', 'main.cjs'),
});

console.log('🔨  preload.ts → dist-electron/preload.cjs');
await build({
  ...shared,
  entryPoints: [path.join(ROOT, 'preload.ts')],
  outfile:     path.join(ROOT, 'dist-electron', 'preload.cjs'),
});

console.log('\n✅  Done — dist-electron/main.cjs + preload.cjs\n');
