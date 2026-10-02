import { describe, expect, it } from 'vitest'

import { contarUsos, leerUsos, ordenarPorUso, registrarUso, sumarUsos } from './usos'

function deposito(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; datos: Record<string, string> } {
  const datos: Record<string, string> = {}
  return { datos, getItem: (k) => datos[k] ?? null, setItem: (k, v) => void (datos[k] = v), removeItem: (k) => void delete datos[k] }
}

describe('usos', () => {
  it('cuenta por categoría y "Sin categoría" no cuenta', () => {
    expect(contarUsos([{ categoria_id: 5 }, { categoria_id: 5 }, { categoria_id: null }, { categoria_id: 29 }])).toEqual({ 5: 2, 29: 1 })
  })

  it('suma el buzón con lo del teléfono', () => {
    expect(sumarUsos({ 5: 2 }, { 5: 1, 29: 3 })).toEqual({ 5: 3, 29: 3 })
  })

  it('ordena por uso y, a igual uso, por nombre', () => {
    const categorias = [
      { id: 1, nombre: 'Zapatos' },
      { id: 2, nombre: 'Auto' },
      { id: 3, nombre: 'Mercado' },
      { id: 4, nombre: 'Escuela' },
    ]
    expect(ordenarPorUso(categorias, { 3: 9, 1: 2, 2: 2 }).map((c) => c.nombre)).toEqual(['Mercado', 'Auto', 'Zapatos', 'Escuela'])
    // Sin usos: puro alfabético, como antes.
    expect(ordenarPorUso(categorias, {}).map((c) => c.nombre)).toEqual(['Auto', 'Escuela', 'Mercado', 'Zapatos'])
  })

  it('registrarUso suma uno en el teléfono y sobrevive a un depósito roto', () => {
    const d = deposito()
    registrarUso(d, 5)
    registrarUso(d, 5)
    registrarUso(d, null)
    expect(leerUsos(d)).toEqual({ 5: 2 })
    d.datos['gastos-usos'] = '[1,2'
    expect(leerUsos(d)).toEqual({})
  })
})
