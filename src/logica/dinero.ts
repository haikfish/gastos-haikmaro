/** El monto en pesos: dígitos adentro, puntos de miles a la vista.
 *
 * El campo formatea EN VIVO —se tipea 2200000 y se lee 2.200.000— y manda el
 * entero. Mismo criterio que los otros dos sistemas del atelier: el formato es
 * de la pantalla, el número es el dato.
 */

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

/** "2200000" → "2.200.000". Vacío queda vacío: el campo sin tocar no dice 0. */
export function conMiles(digitos: string): string {
  const limpio = soloDigitos(digitos).replace(/^0+(?=\d)/, '')
  if (limpio === '') return ''
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function aNumero(texto: string): number | null {
  const limpio = soloDigitos(texto)
  return limpio === '' ? null : Number(limpio)
}
