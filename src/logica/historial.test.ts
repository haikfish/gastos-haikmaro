import { describe, expect, it } from 'vitest'

import type { GastoEnCola } from './cola'
import { armarHistorial, fechaCorta, haceCuanto, montoTexto, quien, type FilaBuzon } from './historial'

const categorias = [
  { id: 5, nombre: 'Fundición' },
  { id: 29, nombre: 'Mercado' },
]
const tarjetas = [{ id: 1, nombre: 'Amex' }]

function fila(parcial: Partial<FilaBuzon>): FilaBuzon {
  return {
    uuid: 'u1',
    tipo_gasto: 'HAIKMARO',
    categoria_id: 5,
    monto: '45000.00',
    fecha: '2026-10-02',
    cargado_por: 'haik@ejemplo.com',
    creado_en: '2026-10-02T10:00:00+00:00',
    importado_en: null,
    ...parcial,
  }
}

describe('quien', () => {
  it('lo mío no lleva nombre; lo de otro, el nombre del mail con mayúscula', () => {
    expect(quien('haik@ejemplo.com', 'Haik@ejemplo.com')).toBeNull()
    expect(quien('maria@ejemplo.com', 'haik@ejemplo.com')).toBe('Maria')
    expect(quien('maria@ejemplo.com', null)).toBe('Maria')
  })
})

describe('armarHistorial', () => {
  it('separa sin subir, pendientes y bajados, lo más nuevo arriba', () => {
    const cola: GastoEnCola[] = [
      { uuid: 'c1', tipo_gasto: 'FAMILIAR', categoria_id: 29, monto: 1200, fecha: '2026-10-02' },
      { uuid: 'c2', tipo_gasto: 'HAIKMARO', categoria_id: null, monto: 300, fecha: '2026-10-02' },
    ]
    const filas = [
      fila({ uuid: 'b1', creado_en: '2026-10-01T09:00:00+00:00' }),
      fila({ uuid: 'b2', creado_en: '2026-10-02T09:00:00+00:00', cargado_por: 'maria@ejemplo.com', notas: 'ferretería' }),
      fila({ uuid: 'b3', creado_en: '2026-09-30T09:00:00+00:00', importado_en: '2026-10-01T12:00:00+00:00', monto: 99.5 }),
    ]
    const h = armarHistorial(cola, filas, categorias, tarjetas, 'haik@ejemplo.com')
    expect(h.sinSubir.map((l) => [l.uuid, l.categoria, l.monto])).toEqual([
      ['c2', 'Sin categoría', '300'],
      ['c1', 'Mercado', '1.200'],
    ])
    expect(h.pendientes.map((l) => [l.uuid, l.detalle])).toEqual([
      ['b2', 'ferretería · Maria'],
      ['b1', ''],
    ])
    expect(h.bajados).toHaveLength(1)
    expect(h.bajados[0]).toMatchObject({ uuid: 'b3', estado: 'bajado', bajadoEl: '2026-10-01', monto: '99,50' })
  })

  it('lo de la cola que ya está en el buzón no se duplica, y la tarjeta se describe', () => {
    const cola: GastoEnCola[] = [{ uuid: 'x', tipo_gasto: 'HAIKMARO', categoria_id: 5, monto: 10, fecha: '2026-10-02', tarjeta_id: 1, cuotas: 3 }]
    const filas = [fila({ uuid: 'x', tarjeta_id: 1, cuotas: 3 })]
    const h = armarHistorial(cola, filas, categorias, tarjetas, 'haik@ejemplo.com')
    expect(h.sinSubir).toEqual([])
    expect(h.pendientes[0].detalle).toBe('Amex · 3 cuotas')
  })

  it('los bajados se recortan a los últimos N', () => {
    const filas = Array.from({ length: 20 }, (_, i) => fila({ uuid: `b${i}`, creado_en: `2026-09-${String(10 + i).padStart(2, '0')}T09:00:00+00:00`, importado_en: '2026-10-01T00:00:00+00:00' }))
    const h = armarHistorial([], filas, categorias, tarjetas, null, 15)
    expect(h.bajados).toHaveLength(15)
    expect(h.bajados[0].uuid).toBe('b19')
  })
})

describe('fechaCorta y haceCuanto', () => {
  it('fecha corta sin año, y el "hace cuánto" en castellano', () => {
    expect(fechaCorta('2026-10-02')).toBe('02/10')
    const ahora = new Date('2026-10-02T12:00:00Z')
    expect(haceCuanto('2026-10-02T11:59:40Z', ahora)).toBe('recién')
    expect(haceCuanto('2026-10-02T11:30:00Z', ahora)).toBe('hace 30 min')
    expect(haceCuanto('2026-10-02T09:00:00Z', ahora)).toBe('hace 3 h')
    expect(haceCuanto('2026-09-29T12:00:00Z', ahora)).toBe('hace 3 días')
    expect(haceCuanto('2026-10-01T12:00:00Z', ahora)).toBe('hace 1 día')
  })
})

describe('montoTexto', () => {
  it('"45000.00" del buzón se lee 45.000, no 4.500.000', () => {
    expect(montoTexto('45000.00')).toBe('45.000')
    expect(montoTexto(45000)).toBe('45.000')
    expect(montoTexto('2200000.00')).toBe('2.200.000')
    expect(montoTexto('99.5')).toBe('99,50')
    expect(montoTexto(0)).toBe('0')
  })
})
