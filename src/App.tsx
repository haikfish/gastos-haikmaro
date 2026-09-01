/** Una pantalla: tipo → categoría → monto → guardar. Nada más.
 *
 * Pensada para una mano, en la calle, apurado. Lo que se toca para terminar
 * —monto y GUARDAR— vive abajo, al alcance del pulgar; las categorías arriba,
 * en una zona que scrollea sola sin mover el resto (26 categorías no entran
 * sin scroll en ningún teléfono, y achicarlas hasta que entren las volvería
 * intocables — la zona scrollea, la pantalla no).
 *
 * Todo lo tipeado sobrevive: el borrador se guarda en el teléfono en cada
 * tecla, y el gasto guardado entra a la cola ANTES de intentar subir. Cerrar
 * la app, quedarse sin señal o sin batería no pierde nada.
 */

import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { clasificar, encolar, leerCola, sacarDeCola, type GastoEnCola } from './logica/cola'
import { aNumero, conMiles } from './logica/dinero'
import { subirGasto, supabase, traerCategorias, traerTarjetas, type Categoria, type Tarjeta } from './buzon'

//: Sube con cada publicación. Está EN PANTALLA (header y login) porque la
//: pregunta «¿te llegó la versión nueva?» no se puede responder de otra forma.
const VERSION = 'v4'

type Tipo = 'HAIKMARO' | 'FAMILIAR'
type Pago = 'CONTADO' | 'TARJETA'
/** null = «Sin categoría» elegida a propósito; undefined = nada elegido aún. */
type Eleccion = number | null | undefined

const hoy = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD local

function leerJson<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : null
  } catch {
    return null
  }
}

export function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargandoSesion(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (cargandoSesion) return null
  return sesion ? <Carga /> : <Entrar />
}

// --- Login --------------------------------------------------------------------

function Entrar() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  return (
    <form
      className="entrar"
      onSubmit={(e) => {
        e.preventDefault()
        setEntrando(true)
        setError('')
        void supabase.auth
          .signInWithPassword({ email: email.trim(), password: clave })
          .then(({ error }) => {
            if (error) setError('No coincide. Revisá el mail y la contraseña.')
          })
          .finally(() => setEntrando(false))
      }}
    >
      <h1>Haikmaro</h1>
      <p className="subtitulo">Gastos</p>
      <input
        type="email"
        placeholder="Mail"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        autoComplete="current-password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="boton-guardar" disabled={entrando || !email || !clave}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
      {/* La sesión persiste: esto se hace una vez por teléfono. */}
      <p className="version centrada">{VERSION}</p>
    </form>
  )
}

// --- La pantalla de carga -------------------------------------------------------

type Borrador = {
  tipo: Tipo
  eleccion: Eleccion
  monto: string
  fecha: string
  nota: string
  pago?: Pago
  tarjetaId?: number | null
  cuotas?: string
}
type CategoriasGuardadas = { filas: Categoria[]; el: string }

function Carga() {
  const borradorInicial = useRef(leerJson<Borrador>('gastos-borrador')).current
  const [tipo, setTipo] = useState<Tipo>(borradorInicial?.tipo ?? 'HAIKMARO')
  const [eleccion, setEleccion] = useState<Eleccion>(borradorInicial?.eleccion)
  const [monto, setMonto] = useState(borradorInicial?.monto ?? '')
  const [fecha, setFecha] = useState(borradorInicial?.fecha ?? hoy())
  const [nota, setNota] = useState(borradorInicial?.nota ?? '')
  const [pago, setPago] = useState<Pago>(borradorInicial?.pago ?? 'CONTADO')
  const [tarjetaId, setTarjetaId] = useState<number | null>(borradorInicial?.tarjetaId ?? null)
  const [cuotas, setCuotas] = useState(borradorInicial?.cuotas ?? '1')

  const tarjetasGuardadas = useRef(leerJson<Tarjeta[]>('gastos-tarjetas')).current
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>(tarjetasGuardadas ?? [])

  const guardadas = useRef(leerJson<CategoriasGuardadas>('gastos-categorias')).current
  const [categorias, setCategorias] = useState<Categoria[]>(guardadas?.filas ?? [])
  const [categoriasDe, setCategoriasDe] = useState<string | null>(guardadas?.el ?? null)

  const [pendientes, setPendientes] = useState(() => leerCola(localStorage).length)
  const [aviso, setAviso] = useState<{ clase: 'ok' | 'cola' | 'error'; texto: string } | null>(null)

  // Las categorías: del buzón cuando hay red, de la copia local cuando no.
  useEffect(() => {
    void traerCategorias().then((filas) => {
      if (!filas) return
      setCategorias(filas)
      const el = new Date().toISOString()
      setCategoriasDe(el)
      localStorage.setItem('gastos-categorias', JSON.stringify({ filas, el }))
    })
    // Las tarjetas: misma mecánica. Si el buzón aún no tiene la tabla
    // (SQL fase 2 sin correr), no pasa nada: sin tarjetas no hay modo tarjeta.
    void traerTarjetas().then((filas) => {
      if (!filas) return
      setTarjetas(filas)
      localStorage.setItem('gastos-tarjetas', JSON.stringify(filas))
    })
  }, [])

  // El borrador: cada tecla queda en el teléfono.
  useEffect(() => {
    localStorage.setItem(
      'gastos-borrador',
      JSON.stringify({ tipo, eleccion, monto, fecha, nota, pago, tarjetaId, cuotas }),
    )
  }, [tipo, eleccion, monto, fecha, nota, pago, tarjetaId, cuotas])

  // La cola se intenta vaciar al abrir y cada vez que vuelve la señal.
  useEffect(() => {
    void vaciarCola()
    window.addEventListener('online', vaciarCola)
    return () => window.removeEventListener('online', vaciarCola)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function vaciarCola(): Promise<number> {
    let subidos = 0
    for (const g of leerCola(localStorage)) {
      const { status, codigoPg } = await subirGasto(g)
      const veredicto = clasificar(status, codigoPg)
      if (veredicto === 'sin_red') break // sin señal: ni gastar batería con el resto
      sacarDeCola(localStorage, g.uuid)
      if (veredicto === 'rechazado') {
        setAviso({ clase: 'error', texto: 'Un gasto pendiente fue rechazado por el buzón.' })
      } else {
        subidos += 1
      }
    }
    setPendientes(leerCola(localStorage).length)
    return subidos
  }

  async function guardar() {
    const numero = aNumero(monto)
    if (numero === null || numero <= 0 || eleccion === undefined) return

    const enCuotas = Math.max(1, Math.trunc(aNumero(cuotas) ?? 1))
    const gasto: GastoEnCola = {
      uuid: crypto.randomUUID(),
      tipo_gasto: tipo,
      categoria_id: eleccion,
      monto: numero,
      fecha,
      // Solo si se escribió: sin nota no viaja la clave siquiera.
      notas: nota.trim() || undefined,
      // Con tarjeta: la computadora lo importa como pendiente (cuotas).
      ...(pago === 'TARJETA' && tarjetaId !== null ? { tarjeta_id: tarjetaId, cuotas: enCuotas } : {}),
    }

    // A la cola PRIMERO: desde acá, pase lo que pase, el gasto existe.
    encolar(localStorage, gasto)
    setPendientes(leerCola(localStorage).length)

    const nombre =
      eleccion === null
        ? 'Sin categoría'
        : (categorias.find((c) => c.id === eleccion)?.nombre ?? '')

    // La pantalla queda lista para el siguiente ANTES de esperar la red.
    // El modo de pago y la tarjeta quedan como están (varios tickets de la
    // misma tarjeta seguidos es el caso común); las cuotas vuelven a 1.
    setEleccion(undefined)
    setMonto('')
    setNota('')
    setCuotas('1')
    setFecha(hoy())
    localStorage.removeItem('gastos-borrador')

    const subidos = await vaciarCola()
    setAviso(
      subidos > 0
        ? { clase: 'ok', texto: `Guardado ✓ ${conMiles(String(numero))} · ${nombre}` }
        : {
            clase: 'cola',
            texto: `Sin señal — ${conMiles(String(numero))} · ${nombre} quedó en el teléfono y se sube solo.`,
          },
    )
  }

  const visibles = categorias
    .filter((c) => c.activo && c.tipo_gasto === tipo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const tarjetasActivas = tarjetas.filter((t) => t.activa)
  const listo =
    aNumero(monto) !== null &&
    aNumero(monto)! > 0 &&
    eleccion !== undefined &&
    (pago === 'CONTADO' || tarjetaId !== null)

  return (
    <div className="app">
      <header>
        <span className="marca">
          Haikmaro <small>GASTOS</small>
        </span>
        <input
          type="date"
          className="fecha"
          value={fecha}
          max={hoy()}
          onChange={(e) => setFecha(e.target.value || hoy())}
          aria-label="Fecha del gasto"
        />
        <button type="button" className="salir" onClick={() => void supabase.auth.signOut()}>
          salir
        </button>
        <span className="version">{VERSION}</span>
      </header>

      <div className="tipos">
        {(['HAIKMARO', 'FAMILIAR'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`tipo${tipo === t ? ' elegido' : ''}`}
            onClick={() => {
              setTipo(t)
              setEleccion(undefined) // la elección era del otro universo
            }}
          >
            {t === 'HAIKMARO' ? 'Haikmaro' : 'Familia'}
          </button>
        ))}
      </div>

      {/* Contado o tarjeta. Solo aparece si hay tarjetas en la copia: sin
          la fase 2 del buzón, la pantalla es la de siempre. */}
      {tarjetasActivas.length > 0 && (
        <div className="pago">
          <div className="pago-opciones">
            {(['CONTADO', 'TARJETA'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`tipo chico${pago === p ? ' elegido' : ''}`}
                onClick={() => setPago(p)}
              >
                {p === 'CONTADO' ? 'Contado' : 'Tarjeta'}
              </button>
            ))}
          </div>
          {pago === 'TARJETA' && (
            <div className="tarjetas-fila">
              {tarjetasActivas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tarjeta-chip${tarjetaId === t.id ? ' elegida' : ''}`}
                  onClick={() => setTarjetaId(t.id)}
                >
                  {t.nombre}
                </button>
              ))}
              <label className="cuotas-etiqueta">
                cuotas
                <input
                  className="cuotas"
                  inputMode="numeric"
                  autoComplete="off"
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setCuotas((v) => (aNumero(v) && aNumero(v)! >= 1 ? v : '1'))}
                  aria-label="Cantidad de cuotas"
                />
              </label>
            </div>
          )}
        </div>
      )}

      <div className="categorias">
        {/* «Sin categoría» primero y siempre visible: es la de cuando más
            apuro hay. Se asigna la de verdad después, en la computadora. */}
        <button
          type="button"
          className={`categoria sin-cat${eleccion === null ? ' elegida' : ''}`}
          onClick={() => setEleccion(null)}
        >
          Sin categoría
        </button>
        {visibles.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`categoria${eleccion === c.id ? ' elegida' : ''}`}
            onClick={() => setEleccion(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <footer>
        {aviso && (
          <p className={`aviso ${aviso.clase}`} onAnimationEnd={() => setAviso(null)}>
            {aviso.texto}
          </p>
        )}
        {pendientes > 0 && !aviso && (
          <p className="aviso cola">
            {pendientes} gasto{pendientes > 1 ? 's' : ''} esperando señal — se suben solos.
          </p>
        )}
        {categoriasDe === null && categorias.length === 0 && (
          <p className="aviso error">Sin categorías todavía: abrila una vez con señal.</p>
        )}
        {/* La nota es lo único opcional de la pantalla y se ve como tal:
            chica, arriba del monto, sin robar protagonismo. */}
        <input
          className="nota"
          placeholder="Nota (opcional)"
          maxLength={200}
          autoComplete="off"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <div className="monto-fila">
          <input
            className="monto"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            aria-label="Monto en pesos"
            value={monto}
            onChange={(e) => setMonto(conMiles(e.target.value))}
          />
          <span className="pesos">pesos</span>
        </div>
        <button type="button" className="boton-guardar" disabled={!listo} onClick={() => void guardar()}>
          GUARDAR
        </button>
      </footer>
    </div>
  )
}
