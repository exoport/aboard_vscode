// One bundle, no runtime dependencies, `vscode` left external because the host
// provides it. CommonJS on purpose: VS Code loads `main` with require(), and an
// ESM bundle would need an .mjs entry the manifest cannot name.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  // The floor engines.vscode ^1.90.0 ships (Electron 29 / Node 20).
  target: 'node20',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
