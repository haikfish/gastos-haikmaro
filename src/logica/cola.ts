/** La cola offline: ningún gasto se pierde por falta de señal.
 *
 * **El orden es la garantía**: todo gasto se ENCOLA primero y se sube después.
 * Si la app muere entre medio —se cerró, se quedó sin batería, se cayó la
 * señal— el gasto ya está en el teléfono y el próximo arranque lo sube. Subir
 * primero y encolar "si falla" deja una ventana en la que un gasto tipeado
 * desaparece, y esa ventana es exactamente cuando peor señal hay.
 *
 * El uuid nace acá y viaja con el gasto: si un reintento repite un envío que
 * en realidad había llegado, el buzón lo rebota (clave primaria) y la cola lo
 * da por subido. Duplicar es imposible por construcción.
 *
 * `Deposito` es la interfaz de localStorage, inyectable para poder testear la
 * lógica sin navegador.
 */

export type GastoEnCola = {
  uuid: string
  tipo_gasto: 'HAIKMARO' | 'FAMILIAR'
  categoria_id: number | null
  monto: number
  fecha: string
  /** Opcional: solo viaja si se escribió. JSON.stringify omite undefined, así
   *  que un buzón sin la columna ni se entera de que la app la conoce. */
  notas?: string
  /** Pago con tarjeta: la computadora lo importa como PENDIENTE (con sus
   *  cuotas) — no entra a los gastos del mes hasta pagar el resumen. Sin
   *  estos campos, contado: el flujo de siempre, intacto. */
  tarjeta_id?: number
  cuotas?: number
}

export type Deposito = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const CLAVE = 'gastos-cola'

export function leerCola(deposito: Deposito): GastoEnCola[] {
  try {
    const crudo = deposito.getItem(CLAVE)
    const lista = crudo ? JSON.parse(crudo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    // Un depósito ilegible no puede tirar la app: se arranca con cola vacía.
    return []
  }
}

export function encolar(deposito: Deposito, gasto: GastoEnCola): void {
  const cola = leerCola(deposito)
  if (cola.some((g) => g.uuid === gasto.uuid)) return
  deposito.setItem(CLAVE, JSON.stringify([...cola, gasto]))
}

export function sacarDeCola(deposito: Deposito, uuid: string): void {
  const cola = leerCola(deposito).filter((g) => g.uuid !== uuid)
  deposito.setItem(CLAVE, JSON.stringify(cola))
}

/** Qué hacer con el resultado de un intento de subida.
 *
 * `subido` y `duplicado` sacan el gasto de la cola — duplicado significa que
 * YA está en el buzón, que es el éxito del reintento. `rechazado` también lo
 * saca pero se muestra: el buzón le dijo que no (datos inválidos, permiso) y
 * reintentarlo eternamente no lo va a arreglar. `sin_red` lo deja donde está.
 */
export type Veredicto = 'subido' | 'duplicado' | 'rechazado' | 'sin_red'

export function clasificar(status: number | null, codigoPg?: string): Veredicto {
  if (status === null) return 'sin_red' // fetch tiró: no hay conexión
  if (status >= 200 && status < 300) return 'subido'
  if (status === 409 || codigoPg === '23505') return 'duplicado'
  return 'rechazado'
}
