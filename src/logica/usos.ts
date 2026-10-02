/** Las categorías ordenadas por uso (v5, 02/10/2026): las más usadas arriba.
 *
 * Dos fuentes que se suman:
 * - **El buzón**: cuántas veces aparece cada categoría en los últimos gastos
 *   (de los dos teléfonos). Es la memoria larga y compartida.
 * - **El teléfono**: cada gasto guardado suma uno al instante, así la
 *   categoría recién usada sube ya, sin esperar a que el buzón conteste.
 *
 * A igual uso, por nombre. Puro: ni red ni localStorage adentro (`Deposito`
 * se inyecta, como en la cola).
 */

import type { Deposito } from './cola'

export type Usos = Record<string, number>

const CLAVE = 'gastos-usos'

/** {categoria_id: veces} a partir de filas del buzón. Sin categoría (null) no cuenta. */
export function contarUsos(filas: { categoria_id: number | null }[]): Usos {
  const usos: Usos = {}
  for (const f of filas) {
    if (f.categoria_id === null || f.categoria_id === undefined) continue
    usos[f.categoria_id] = (usos[f.categoria_id] ?? 0) + 1
  }
  return usos
}

export function sumarUsos(a: Usos, b: Usos): Usos {
  const out: Usos = { ...a }
  for (const [id, n] of Object.entries(b)) out[id] = (out[id] ?? 0) + n
  return out
}

export function leerUsos(deposito: Deposito): Usos {
  try {
    const crudo = deposito.getItem(CLAVE)
    const usos = crudo ? JSON.parse(crudo) : {}
    return usos && typeof usos === 'object' && !Array.isArray(usos) ? (usos as Usos) : {}
  } catch {
    return {}
  }
}

export function registrarUso(deposito: Deposito, categoriaId: number | null): void {
  if (categoriaId === null) return
  const usos = leerUsos(deposito)
  usos[categoriaId] = (usos[categoriaId] ?? 0) + 1
  deposito.setItem(CLAVE, JSON.stringify(usos))
}

/** Más usadas primero; a igual uso, por nombre (castellano). No muta. */
export function ordenarPorUso<T extends { id: number; nombre: string }>(categorias: T[], usos: Usos): T[] {
  return [...categorias].sort((a, b) => (usos[b.id] ?? 0) - (usos[a.id] ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
}
