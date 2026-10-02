import { describe, expect, it } from 'vitest'

import { filtrarCategorias, normalizar } from './buscar'

describe('buscar', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalizar('  Fundición ')).toBe('fundicion')
    expect(normalizar('ÁRBOL')).toBe('arbol')
  })
  it('filtra por cualquier parte del nombre; vacío devuelve todo', () => {
    const cats = [{ nombre: 'Fundición' }, { nombre: 'Celular Maria' }, { nombre: 'gas, mmetrogas' }]
    expect(filtrarCategorias(cats, 'fun').map((c) => c.nombre)).toEqual(['Fundición'])
    expect(filtrarCategorias(cats, 'MARÍA').map((c) => c.nombre)).toEqual(['Celular Maria'])
    expect(filtrarCategorias(cats, 'gas').map((c) => c.nombre)).toEqual(['gas, mmetrogas'])
    expect(filtrarCategorias(cats, '')).toHaveLength(3)
  })
})
