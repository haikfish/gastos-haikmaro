/** El historial simplificado (v5, 02/10/2026): «¿lo anoté o no?».
 *
 * Tres franjas, en este orden, porque es el orden de la duda:
 * 1. **En el teléfono, sin subir** — la cola offline: se anotó, todavía no
 *    llegó al buzón (sin señal). Se sube sola.
 * 2. **En el buzón, pendientes de bajar** — llegaron al buzón y la
 *    computadora todavía no las importó (`importado_en` en null).
 * 3. **Ya en la computadora** — las últimas importadas, en gris: la duda
 *    «¿lo anoté?» también se contesta cuando ya bajó.
 *
 * Puro: ni red ni fecha de hoy adentro. La app trae las filas y la cola.
 */

import type { GastoEnCola } from './cola'
import { conMiles } from './dinero'

export type FilaBuzon = {
  uuid: string
  tipo_gasto: 'HAIKMARO' | 'FAMILIAR'
  categoria_id: number | null
  monto: number | string
  fecha: string
  notas?: string | null
  cargado_por: string
  creado_en: string
  importado_en: string | null
  tarjeta_id?: number | null
  cuotas?: number | null
}

export type Nombrado = { id: number; nombre: string }

export type Linea = {
  uuid: string
  fecha: string // AAAA-MM-DD
  categoria: string
  tipo: 'HAIKMARO' | 'FAMILIAR'
  monto: string // con miles
  detalle: string // "tarjeta Amex · 3 cuotas", la nota, quién
  estado: 'sin_subir' | 'pendiente' | 'bajado'
  /** Cuándo bajó a la computadora (solo en «bajado»), AAAA-MM-DD. */
  bajadoEl?: string
}

export type Historial = {
  sinSubir: Linea[]
  pendientes: Linea[]
  bajados: Linea[]
}

/** "haik@..." → "Haik". Solo cuando no soy yo: lo mío no lleva nombre. */
export function quien(email: string, mio: string | null): string | null {
  if (mio && email.toLowerCase() === mio.toLowerCase()) return null
  const local = email.split('@')[0] ?? email
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null
}

export function diaDe(iso: string): string {
  return iso.slice(0, 10)
}

/** "2026-10-02" → "02/10". El año no se muestra: es un historial de días. */
export function fechaCorta(aaaaMmDd: string): string {
  const [, m, d] = aaaaMmDd.split('-')
  return m && d ? `${d}/${m}` : aaaaMmDd
}

/** El monto como llega del buzón ("45000.00", numeric) o de la cola (45000)
 *  → "45.000"; con centavos, "99,50". `conMiles` solo sabe de dígitos (es
 *  para tipear), así que acá se separa la parte entera antes: sin esto,
 *  "45000.00" se leía "4.500.000". */
export function montoTexto(valor: number | string): string {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n)) return String(valor)
  const abs = Math.abs(n)
  const entero = Math.trunc(abs)
  const centavos = Math.round((abs - entero) * 100)
  const texto = (n < 0 ? '-' : '') + (conMiles(String(entero)) || '0')
  return centavos > 0 ? `${texto},${String(centavos).padStart(2, '0')}` : texto
}

function nombreCategoria(id: number | null, categorias: Nombrado[]): string {
  if (id === null) return 'Sin categoría'
  return categorias.find((c) => c.id === id)?.nombre ?? `Categoría ${id}`
}

function detalleDe(
  gasto: { notas?: string | null; tarjeta_id?: number | null; cuotas?: number | null },
  tarjetas: Nombrado[],
  nombre: string | null,
): string {
  const partes: string[] = []
  if (gasto.tarjeta_id) {
    const t = tarjetas.find((x) => x.id === gasto.tarjeta_id)?.nombre ?? 'tarjeta'
    partes.push(`${t}${gasto.cuotas && gasto.cuotas > 1 ? ` · ${gasto.cuotas} cuotas` : ''}`)
  }
  if (gasto.notas) partes.push(gasto.notas)
  if (nombre) partes.push(nombre)
  return partes.join(' · ')
}

/** Arma las tres franjas. Lo de la cola que YA aparece en el buzón (subió
 *  entre medio) no se duplica: manda el buzón. Dentro de cada franja, lo más
 *  nuevo arriba. */
export function armarHistorial(
  cola: GastoEnCola[],
  filas: FilaBuzon[],
  categorias: Nombrado[],
  tarjetas: Nombrado[],
  mio: string | null,
  maxBajados = 15,
): Historial {
  const enBuzon = new Set(filas.map((f) => f.uuid))
  const sinSubir: Linea[] = [...cola]
    .reverse()
    .filter((g) => !enBuzon.has(g.uuid))
    .map((g) => ({
      uuid: g.uuid,
      fecha: g.fecha,
      categoria: nombreCategoria(g.categoria_id, categorias),
      tipo: g.tipo_gasto,
      monto: montoTexto(g.monto),
      detalle: detalleDe(g, tarjetas, null),
      estado: 'sin_subir',
    }))
  const ordenadas = [...filas].sort((a, b) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : 0))
  const aLinea = (f: FilaBuzon, estado: Linea['estado']): Linea => ({
    uuid: f.uuid,
    fecha: f.fecha,
    categoria: nombreCategoria(f.categoria_id, categorias),
    tipo: f.tipo_gasto,
    monto: montoTexto(f.monto),
    detalle: detalleDe(f, tarjetas, quien(f.cargado_por, mio)),
    estado,
    ...(f.importado_en ? { bajadoEl: diaDe(f.importado_en) } : {}),
  })
  const pendientes = ordenadas.filter((f) => f.importado_en === null).map((f) => aLinea(f, 'pendiente'))
  const bajados = ordenadas
    .filter((f) => f.importado_en !== null)
    .slice(0, maxBajados)
    .map((f) => aLinea(f, 'bajado'))
  return { sinSubir, pendientes, bajados }
}

/** "actualizado hace 3 min" / "hace 2 h" / "hace 3 días", para la copia
 *  guardada en el teléfono cuando no hay señal. */
export function haceCuanto(iso: string, ahora: Date): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  return `hace ${dias} día${dias === 1 ? '' : 's'}`
}
