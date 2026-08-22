import { describe, expect, test } from 'vitest'

import { aNumero, conMiles, soloDigitos } from './dinero'

describe('conMiles', () => {
  test('el ejemplo del encargo', () => {
    expect(conMiles('2200000')).toBe('2.200.000')
  })

  test('formatea en vivo, con lo ya formateado como entrada', () => {
    // El campo se re-formatea en cada tecla: la entrada trae los puntos del
    // render anterior y no pueden duplicarse ni romper la cuenta.
    expect(conMiles('2.200.0001')).toBe('22.000.001')
  })

  test('montos chicos, sin punto', () => {
    expect(conMiles('999')).toBe('999')
    expect(conMiles('1000')).toBe('1.000')
  })

  test('vacío queda vacío: el campo sin tocar no dice 0', () => {
    expect(conMiles('')).toBe('')
    expect(conMiles('abc')).toBe('')
  })

  test('ceros a la izquierda se van', () => {
    expect(conMiles('0015000')).toBe('15.000')
    expect(conMiles('0')).toBe('0')
  })
})

describe('aNumero', () => {
  test('del texto formateado al entero que viaja', () => {
    expect(aNumero('2.200.000')).toBe(2200000)
    expect(aNumero('')).toBeNull()
  })
})

describe('soloDigitos', () => {
  test('pega el teclado lo que pegue', () => {
    expect(soloDigitos('$ 15.000,-')).toBe('15000')
  })
})
