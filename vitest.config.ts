import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Pruebas unitarias de lógica pura (lib/, schemas, mappers, helpers de
// servicios). Sin jsdom: el alcance excluye componentes y hooks de UI, así que
// no hace falta un DOM simulado y las pruebas corren más rápido en 'node'.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/types/**',
        'src/app/**',
        'src/components/**',
      ],
    },
  },
});
