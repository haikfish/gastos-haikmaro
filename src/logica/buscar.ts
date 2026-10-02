/** Buscar una categoría escribiendo (v6): sin acentos ni mayúsculas, y
 *  alcanza con que las letras estén en cualquier parte del nombre. */

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function filtrarCategorias<T extends { nombre: string }>(categorias: T[], busqueda: string): T[] {
  const aguja = normalizar(busqueda)
  if (!aguja) return categorias
  return categorias.filter((c) => normalizar(c.nombre).includes(aguja))
}
