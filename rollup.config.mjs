import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import typescript from 'rollup-plugin-typescript2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  input: 'src/app.ts',
  output: {
    file: 'dist/app.js',
    format: 'esm',
    sourcemap: false,
  },
  external: (id) => id.startsWith('firebase-admin'),
  plugins: [
    typescript({
      tsconfig: resolve(__dirname, 'tsconfig.json'),
      tsconfigOverride: {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2022',
        },
      },
      useTsconfigDeclarationDir: false,
    }),
  ],
  onwarn: (warning, warn) => {
    if (warning.code === 'UNRESOLVED_IMPORT') return;
    warn(warning);
  },
};
