/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app tiene que andar servida desde cualquier carpeta
  // (GitHub Pages la sirve bajo /gastos-haikmaro/, el dev server desde /).
  base: './',
  test: {
    include: ['src/logica/**/*.test.ts'],
  },
})
