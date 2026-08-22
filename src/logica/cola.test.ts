import { describe, expect, test } from 'vitest'

import { clasificar, encolar, leerCola, sacarDeCola, type Deposito, type GastoEnCola } from './cola'

function deposito(): Deposito {
  const datos = new Map<string, string>()
  return {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  }
}

const gasto = (uuid: string): GastoEnCola => ({
  uuid,
  tipo_gasto: 'HAIKMARO',
  categoria_id: 3,
  monto: 15000,
  fecha: '2026-08-22',
})

describe('la cola', () => {
  test('encolar y leer', () => {
    const d = deposito()
    encolar(d, gasto('a'))
    encolar(d, gasto('b'))

    expect(leerCola(d).map((g) => g.uuid)).toEqual(['a', 'b'])
  })

  test('el mismo uuid dos veces no se encola dos veces', () => {
    // El botón GUARDAR apretado dos veces rápido en un celular con lag.
    const d = deposito()
    encolar(d, gasto('a'))
    encolar(d, gasto('a'))

    expect(leerCola(d)).toHaveLength(1)
  })

  test('sacar de la cola deja el resto', () => {
    const d = deposito()
    encolar(d, gasto('a'))
    encolar(d, gasto('b'))
    sacarDeCola(d, 'a')

    expect(leerCola(d).map((g) => g.uuid)).toEqual(['b'])
  })

  test('un depósito roto no tira la app: cola vacía', () => {
    const d = deposito()
    d.setItem('gastos-cola', '{esto no es json')

    expect(leerCola(d)).toEqual([])
  })
})

describe('clasificar el resultado de subir', () => {
  test('2xx sube', () => {
    expect(clasificar(201)).toBe('subido')
  })

  test('el 409 del reintento ES éxito: ya estaba en el buzón', () => {
    // Se subió, se cortó la señal antes de la respuesta, se reintentó.
    // Sin esto, ese gasto quedaría clavado en la cola para siempre.
    expect(clasificar(409)).toBe('duplicado')
    expect(clasificar(400, '23505')).toBe('duplicado')
  })

  test('sin red se queda en la cola', () => {
    expect(clasificar(null)).toBe('sin_red')
  })

  test('un rechazo de verdad no se reintenta eternamente', () => {
    expect(clasificar(403)).toBe('rechazado')
    expect(clasificar(400)).toBe('rechazado')
  })
})
