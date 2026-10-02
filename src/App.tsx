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
 *
 * v6 (02/10/2026): el color sigue al universo (Haikmaro verde, Familia
 * dorado), las categorías se buscan escribiendo, lo pendiente se edita y se
 * borra desde el historial, y guardar deja una tarjeta con "deshacer".
 */

import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { filtrarCategorias } from './logica/buscar'
import { clasificar, encolar, leerCola, reemplazarEnCola, sacarDeCola, type GastoEnCola } from './logica/cola'
import { aNumero, conMiles } from './logica/dinero'
import { armarHistorial, fechaCorta, haceCuanto, type Historial as HistorialArmado } from './logica/historial'
import { contarUsos, leerUsos, ordenarPorUso, registrarUso, sumarUsos, type Usos } from './logica/usos'
import {
  borrarGasto,
  editarGasto,
  subirGasto,
  supabase,
  traerCategorias,
  traerCategoriasUsadas,
  traerHistorial,
  traerTarjetas,
  type Categoria,
  type FilaBuzon,
  type ResultadoBuzon,
  type Tarjeta,
} from './buzon'

//: Sube con cada publicación. Está EN PANTALLA (header y login) porque la
//: pregunta «¿te llegó la versión nueva?» no se puede responder de otra forma.
const VERSION = 'v6'

type Tipo = 'HAIKMARO' | 'FAMILIAR'
type Pago = 'CONTADO' | 'TARJETA'
/** null = «Sin categoría» elegida a propósito; undefined = nada elegido aún. */
type Eleccion = number | null | undefined

/** Un gasto que todavía no bajó a la computadora, abierto para corregir:
 *  de la cola del teléfono (no subió) o del buzón (subió, sigue pendiente). */
export type GastoEditable = {
  uuid: string
  origen: 'cola' | 'buzon'
  tipo_gasto: Tipo
  categoria_id: number | null
  monto: number
  fecha: string
  notas?: string | null
  tarjeta_id?: number | null
  cuotas?: number | null
}

const hoy = () => new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD local

function leerJson<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : null
  } catch {
    return null
  }
}

/** Lo que el buzón contesta cuando no pudo cambiar o borrar, en palabras. */
function explicar(r: ResultadoBuzon, accion: 'cambiar' | 'borrar'): string {
  if (r === 'sin_red') return `Sin señal: probá ${accion === 'cambiar' ? 'cambiarlo' : 'borrarlo'} de nuevo con señal.`
  if (r === 'rechazado') return `El buzón no dejó ${accion === 'cambiar' ? 'cambiarlo' : 'borrarlo'}.`
  return `No se pudo ${accion}: o ya bajó a la computadora, o el buzón todavía no lo permite (falta correr el SQL de la fase 3).`
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
  return sesion ? <Carga sesion={sesion} /> : <Entrar />
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
      <input type="email" placeholder="Mail" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
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
  nota: string
  pago?: Pago
  tarjetaId?: number | null
  cuotas?: string
}
type CategoriasGuardadas = { filas: Categoria[]; el: string }
type Aviso = { clase: 'ok' | 'cola' | 'error'; texto: string; deshacer?: () => Promise<void> }

function Carga({ sesion }: { sesion: Session }) {
  const borradorInicial = useRef(leerJson<Borrador>('gastos-borrador')).current
  const [tipo, setTipo] = useState<Tipo>(borradorInicial?.tipo ?? 'HAIKMARO')
  const [eleccion, setEleccion] = useState<Eleccion>(borradorInicial?.eleccion)
  const [monto, setMonto] = useState(borradorInicial?.monto ?? '')
  // La fecha arranca en HOY siempre — nunca en la del borrador. El borrador
  // conserva monto, nota y categoría a medio tipear, pero una fecha vieja
  // restaurada es el error clásico: gastos cargados con el día que quedó de
  // la última vez sin que se note (lo cazó el dueño el 02/09/2026).
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState(borradorInicial?.nota ?? '')
  const [pago, setPago] = useState<Pago>(borradorInicial?.pago ?? 'CONTADO')
  const [tarjetaId, setTarjetaId] = useState<number | null>(borradorInicial?.tarjetaId ?? null)
  const [cuotas, setCuotas] = useState(borradorInicial?.cuotas ?? '1')
  const [busqueda, setBusqueda] = useState('')

  const tarjetasGuardadas = useRef(leerJson<Tarjeta[]>('gastos-tarjetas')).current
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>(tarjetasGuardadas ?? [])

  const guardadas = useRef(leerJson<CategoriasGuardadas>('gastos-categorias')).current
  const [categorias, setCategorias] = useState<Categoria[]>(guardadas?.filas ?? [])
  const [categoriasDe, setCategoriasDe] = useState<string | null>(guardadas?.el ?? null)

  const [pendientes, setPendientes] = useState(() => leerCola(localStorage).length)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  // v5: la pantalla del historial («¿lo anoté o no?») reemplaza la de carga
  // mientras está abierta. Lo que había a medio tipear sigue en el borrador.
  const [pantalla, setPantalla] = useState<'carga' | 'historial'>('carga')
  // v6: un gasto pendiente abierto para corregir ocupa el formulario.
  const [editando, setEditando] = useState<GastoEditable | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // v5: las categorías van por uso. Lo del buzón (compartido) se guarda en
  // el teléfono; lo propio se suma en cada guardado.
  const [usosBuzon, setUsosBuzon] = useState<Usos>(() => leerJson<Usos>('gastos-usos-buzon') ?? {})
  const [usosLocales, setUsosLocales] = useState<Usos>(() => leerUsos(localStorage))

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
    // Los usos del buzón: al llegar, pisan la copia guardada y también lo
    // sumado localmente (ya está contado ahí, si subió).
    void traerCategoriasUsadas().then((filas) => {
      if (!filas) return
      const usos = contarUsos(filas)
      setUsosBuzon(usos)
      localStorage.setItem('gastos-usos-buzon', JSON.stringify(usos))
      localStorage.removeItem('gastos-usos')
      setUsosLocales({})
    })
  }, [])

  // El borrador: cada tecla queda en el teléfono. Editando no: es otro gasto.
  useEffect(() => {
    if (editando) return
    localStorage.setItem('gastos-borrador', JSON.stringify({ tipo, eleccion, monto, nota, pago, tarjetaId, cuotas }))
  }, [tipo, eleccion, monto, nota, pago, tarjetaId, cuotas, editando])

  // Si la app quedó abierta de fondo y cambió el día, la fecha "hoy" se
  // corre sola al volver al frente — pero solo si seguía en el hoy viejo:
  // una fecha cambiada a mano (cargar un gasto de ayer) no se pisa.
  const hoyVisto = useRef(hoy())
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'hidden') return
      const nuevoHoy = hoy()
      if (nuevoHoy !== hoyVisto.current) {
        setFecha((f) => (f === hoyVisto.current ? nuevoHoy : f))
        hoyVisto.current = nuevoHoy
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [])

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

  function limpiarFormulario() {
    // El modo de pago y la tarjeta quedan como están (varios tickets de la
    // misma tarjeta seguidos es el caso común); las cuotas vuelven a 1.
    setEleccion(undefined)
    setMonto('')
    setNota('')
    setCuotas('1')
    setFecha(hoy())
    setBusqueda('')
    localStorage.removeItem('gastos-borrador')
  }

  function nombreDe(id: Eleccion): string {
    return id === null ? 'Sin categoría' : (categorias.find((c) => c.id === id)?.nombre ?? '')
  }

  /** Lo que describe el gasto en la tarjeta de confirmación: todo lo que se
   *  guardó, para verlo de un vistazo y deshacer si algo no cierra. */
  function describir(g: GastoEnCola | GastoEditable): string {
    const partes = [g.tipo_gasto === 'HAIKMARO' ? 'Haikmaro' : 'Familia', nombreDe(g.categoria_id), `${conMiles(String(g.monto))} $`]
    if (g.tarjeta_id) partes.push(`${tarjetas.find((t) => t.id === g.tarjeta_id)?.nombre ?? 'tarjeta'}${g.cuotas && g.cuotas > 1 ? ` · ${g.cuotas} cuotas` : ''}`)
    if (g.fecha !== hoy()) partes.push(fechaCorta(g.fecha))
    if (g.notas) partes.push(g.notas)
    return partes.join(' · ')
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
    registrarUso(localStorage, eleccion)
    setUsosLocales(leerUsos(localStorage))
    setPendientes(leerCola(localStorage).length)

    const texto = describir(gasto)
    // La pantalla queda lista para el siguiente ANTES de esperar la red.
    limpiarFormulario()

    // Deshacer (v6): si todavía está en el teléfono, se saca de la cola; si
    // ya subió, se borra del buzón (mientras no haya bajado a la compu).
    const deshacer = async () => {
      if (leerCola(localStorage).some((g) => g.uuid === gasto.uuid)) {
        sacarDeCola(localStorage, gasto.uuid)
        setPendientes(leerCola(localStorage).length)
        setAviso({ clase: 'cola', texto: `Deshecho: ${texto} no se guardó.` })
        return
      }
      const r = await borrarGasto(gasto.uuid)
      setAviso(r === 'ok' ? { clase: 'cola', texto: `Deshecho: ${texto} se borró del buzón.` } : { clase: 'error', texto: explicar(r, 'borrar') })
    }

    const subidos = await vaciarCola()
    setAviso(
      subidos > 0
        ? { clase: 'ok', texto: `Guardado ✓ ${texto}`, deshacer }
        : { clase: 'cola', texto: `Sin señal — ${texto} quedó en el teléfono y se sube solo.`, deshacer },
    )
  }

  // --- Edición de lo pendiente (v6) ---

  function abrirEdicion(g: GastoEditable) {
    setEditando(g)
    setTipo(g.tipo_gasto)
    setEleccion(g.categoria_id)
    setMonto(conMiles(String(g.monto)))
    setFecha(g.fecha)
    setNota(g.notas ?? '')
    setPago(g.tarjeta_id ? 'TARJETA' : 'CONTADO')
    setTarjetaId(g.tarjeta_id ?? null)
    setCuotas(String(g.cuotas ?? 1))
    setBusqueda('')
    setAviso(null)
    setPantalla('carga')
  }

  function cerrarEdicion(avisoFinal: Aviso | null) {
    setEditando(null)
    // El borrador de antes de editar se recupera del teléfono.
    const b = leerJson<Borrador>('gastos-borrador')
    setTipo(b?.tipo ?? 'HAIKMARO')
    setEleccion(b?.eleccion)
    setMonto(b?.monto ?? '')
    setNota(b?.nota ?? '')
    setPago(b?.pago ?? 'CONTADO')
    setTarjetaId(b?.tarjetaId ?? null)
    setCuotas(b?.cuotas ?? '1')
    setFecha(hoy())
    setAviso(avisoFinal)
    setPantalla('historial')
  }

  async function guardarEdicion() {
    if (!editando) return
    const numero = aNumero(monto)
    if (numero === null || numero <= 0 || eleccion === undefined) return
    const enCuotas = Math.max(1, Math.trunc(aNumero(cuotas) ?? 1))
    const conTarjeta = pago === 'TARJETA' && tarjetaId !== null
    const cambiado: GastoEditable = {
      ...editando,
      tipo_gasto: tipo,
      categoria_id: eleccion,
      monto: numero,
      fecha,
      notas: nota.trim() || null,
      tarjeta_id: conTarjeta ? tarjetaId : null,
      cuotas: conTarjeta ? enCuotas : null,
    }
    setOcupado(true)
    try {
      // En el teléfono todavía: se cambia en la cola. Si subió entre medio,
      // reemplazarEnCola avisa y se sigue por el buzón.
      if (editando.origen === 'cola') {
        const enCola: GastoEnCola = {
          uuid: cambiado.uuid,
          tipo_gasto: cambiado.tipo_gasto,
          categoria_id: cambiado.categoria_id,
          monto: cambiado.monto,
          fecha: cambiado.fecha,
          notas: cambiado.notas ?? undefined,
          ...(conTarjeta ? { tarjeta_id: tarjetaId, cuotas: enCuotas } : {}),
        }
        if (reemplazarEnCola(localStorage, enCola)) {
          cerrarEdicion({ clase: 'ok', texto: `Cambiado ✓ ${describir(cambiado)}` })
          void vaciarCola()
          return
        }
      }
      const r = await editarGasto(cambiado.uuid, {
        tipo_gasto: cambiado.tipo_gasto,
        categoria_id: cambiado.categoria_id,
        monto: cambiado.monto,
        fecha: cambiado.fecha,
        notas: cambiado.notas,
        tarjeta_id: cambiado.tarjeta_id,
        cuotas: cambiado.cuotas,
      })
      if (r === 'ok') cerrarEdicion({ clase: 'ok', texto: `Cambiado ✓ ${describir(cambiado)}` })
      else setAviso({ clase: 'error', texto: explicar(r, 'cambiar') })
    } finally {
      setOcupado(false)
    }
  }

  async function borrarEditado() {
    if (!editando) return
    if (!confirm(`¿Borrar este gasto? ${describir(editando)}`)) return
    setOcupado(true)
    try {
      if (editando.origen === 'cola' && leerCola(localStorage).some((g) => g.uuid === editando.uuid)) {
        sacarDeCola(localStorage, editando.uuid)
        setPendientes(leerCola(localStorage).length)
        cerrarEdicion({ clase: 'cola', texto: 'Borrado: no se va a subir.' })
        return
      }
      const r = await borrarGasto(editando.uuid)
      if (r === 'ok') cerrarEdicion({ clase: 'cola', texto: 'Borrado del buzón.' })
      else setAviso({ clase: 'error', texto: explicar(r, 'borrar') })
    } finally {
      setOcupado(false)
    }
  }

  // Las más usadas arriba (buzón + teléfono); a igual uso, por nombre. Y si
  // se escribió algo en el buscador, solo las que lo contienen.
  const visibles = filtrarCategorias(
    ordenarPorUso(
      categorias.filter((c) => c.activo && c.tipo_gasto === tipo),
      sumarUsos(usosBuzon, usosLocales),
    ),
    busqueda,
  )
  const tarjetasActivas = tarjetas.filter((t) => t.activa)
  const listo =
    aNumero(monto) !== null &&
    aNumero(monto)! > 0 &&
    eleccion !== undefined &&
    (pago === 'CONTADO' || tarjetaId !== null)
  const universo = tipo === 'HAIKMARO' ? 'haikmaro' : 'familia'

  if (pantalla === 'historial') {
    return (
      <div className={`app en-historial ${universo}`}>
        <header>
          <span className="marca">
            Haikmaro <small>HISTORIAL</small>
          </span>
          <button type="button" className="historial-boton" onClick={() => setPantalla('carga')}>
            ← cargar
          </button>
          <span className="version">{VERSION}</span>
        </header>
        <Historial
          categorias={categorias}
          tarjetas={tarjetas}
          mio={sesion.user.email ?? null}
          onEditar={abrirEdicion}
          aviso={
            aviso && (
              <p className={`aviso ${aviso.clase} en-historial`} onAnimationEnd={() => setAviso(null)}>
                {aviso.texto}
              </p>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className={`app ${universo}${editando ? ' editando' : ''}`}>
      {/* v5: dos filas. Con el botón de historial, una sola fila no entra en
          un teléfono de 390 px: la fecha y las acciones van debajo de la marca. */}
      <header className="dos-filas">
        <span className="marca">
          Haikmaro <small>{editando ? 'CORRIGIENDO' : 'GASTOS'}</small>
        </span>
        <span className="version">{VERSION}</span>
        <div className="acciones">
          <input
            type="date"
            className="fecha"
            value={fecha}
            max={hoy()}
            onChange={(e) => setFecha(e.target.value || hoy())}
            aria-label="Fecha del gasto"
          />
          {editando ? (
            <button type="button" className="historial-boton" onClick={() => cerrarEdicion(null)}>
              cancelar
            </button>
          ) : (
            <>
              <button type="button" className="historial-boton" onClick={() => setPantalla('historial')} aria-label="Ver el historial">
                historial{pendientes > 0 && <span className="cuenta">{pendientes}</span>}
              </button>
              <button type="button" className="salir" onClick={() => void supabase.auth.signOut()}>
                salir
              </button>
            </>
          )}
        </div>
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
              <button key={p} type="button" className={`tipo chico${pago === p ? ' elegido' : ''}`} onClick={() => setPago(p)}>
                {p === 'CONTADO' ? 'Contado' : 'Tarjeta'}
              </button>
            ))}
          </div>
          {pago === 'TARJETA' && (
            <div className="tarjetas-fila">
              {tarjetasActivas.map((t) => (
                <button key={t.id} type="button" className={`tarjeta-chip${tarjetaId === t.id ? ' elegida' : ''}`} onClick={() => setTarjetaId(t.id)}>
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
        {/* v6: buscar escribiendo. Queda pegado arriba mientras la zona scrollea. */}
        <input
          className="buscar"
          type="search"
          placeholder="Buscar categoría…"
          autoComplete="off"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar categoría"
        />
        {/* «Sin categoría» primero y siempre visible: es la de cuando más
            apuro hay. Se asigna la de verdad después, en la computadora. */}
        {!busqueda && (
          <button type="button" className={`categoria sin-cat${eleccion === null ? ' elegida' : ''}`} onClick={() => setEleccion(null)}>
            Sin categoría
          </button>
        )}
        {visibles.map((c) => (
          <button key={c.id} type="button" className={`categoria${eleccion === c.id ? ' elegida' : ''}`} onClick={() => setEleccion(c.id)}>
            {c.nombre}
          </button>
        ))}
        {busqueda && visibles.length === 0 && <p className="nada">Ninguna categoría con «{busqueda}».</p>}
      </div>

      <footer>
        {aviso && (
          <div className={`aviso ${aviso.clase}${aviso.deshacer ? ' con-deshacer' : ''}`} onAnimationEnd={() => setAviso(null)}>
            <span>{aviso.texto}</span>
            {aviso.deshacer && (
              <button
                type="button"
                className="deshacer"
                onClick={() => {
                  const d = aviso.deshacer!
                  setAviso(null)
                  void d()
                }}
              >
                Deshacer
              </button>
            )}
          </div>
        )}
        {pendientes > 0 && !aviso && !editando && (
          <p className="aviso cola">
            {pendientes} gasto{pendientes > 1 ? 's' : ''} esperando señal — se suben solos.
          </p>
        )}
        {categoriasDe === null && categorias.length === 0 && <p className="aviso error">Sin categorías todavía: abrila una vez con señal.</p>}
        {/* La nota es lo único opcional de la pantalla y se ve como tal:
            chica, arriba del monto, sin robar protagonismo. */}
        <input className="nota" placeholder="Nota (opcional)" maxLength={200} autoComplete="off" value={nota} onChange={(e) => setNota(e.target.value)} />
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
        {editando ? (
          <>
            <button type="button" className="boton-guardar" disabled={!listo || ocupado} onClick={() => void guardarEdicion()}>
              GUARDAR CAMBIOS
            </button>
            <button type="button" className="borrar" disabled={ocupado} onClick={() => void borrarEditado()}>
              borrar este gasto
            </button>
          </>
        ) : (
          <button type="button" className="boton-guardar" disabled={!listo} onClick={() => void guardar()}>
            GUARDAR
          </button>
        )}
      </footer>
    </div>
  )
}

// --- El historial: «¿lo anoté o no?» -------------------------------------------

type HistorialGuardado = { filas: FilaBuzon[]; el: string }

/** Tres franjas: lo que sigue en el teléfono sin subir, lo que está en el
 *  buzón esperando que la computadora lo baje, y lo último que ya bajó. Con
 *  señal se trae del buzón; sin señal se muestra la última copia guardada,
 *  diciendo de cuándo es. La cola local se lee siempre: está en el teléfono.
 *  Lo pendiente se toca para corregirlo (v6). */
function Historial({
  categorias,
  tarjetas,
  mio,
  onEditar,
  aviso,
}: {
  categorias: Categoria[]
  tarjetas: Tarjeta[]
  mio: string | null
  onEditar: (g: GastoEditable) => void
  /** El aviso de lo recién cambiado o borrado, arriba de la lista (adentro
   *  de la zona que scrollea: afuera caía en la fila elástica y se estiraba). */
  aviso?: React.ReactNode
}) {
  const guardado = useRef(leerJson<HistorialGuardado>('gastos-historial')).current
  const [filas, setFilas] = useState<FilaBuzon[] | null>(guardado?.filas ?? null)
  const [de, setDe] = useState<string | null>(guardado?.el ?? null)
  const [red, setRed] = useState<'cargando' | 'ok' | 'sin_red'>('cargando')

  useEffect(() => {
    let vivo = true
    void traerHistorial().then((nuevas) => {
      if (!vivo) return
      if (!nuevas) {
        setRed('sin_red')
        return
      }
      const el = new Date().toISOString()
      setFilas(nuevas)
      setDe(el)
      setRed('ok')
      localStorage.setItem('gastos-historial', JSON.stringify({ filas: nuevas, el }))
    })
    return () => {
      vivo = false
    }
  }, [])

  const cola = leerCola(localStorage)
  const h: HistorialArmado = armarHistorial(cola, filas ?? [], categorias, tarjetas, mio)
  const nada = h.sinSubir.length === 0 && h.pendientes.length === 0 && h.bajados.length === 0

  function editar(uuid: string) {
    const enCola = cola.find((g) => g.uuid === uuid)
    if (enCola) {
      onEditar({ ...enCola, origen: 'cola' })
      return
    }
    const f = (filas ?? []).find((x) => x.uuid === uuid)
    if (!f || f.importado_en) return
    onEditar({
      uuid: f.uuid,
      origen: 'buzon',
      tipo_gasto: f.tipo_gasto,
      categoria_id: f.categoria_id,
      monto: Number(f.monto),
      fecha: f.fecha,
      notas: f.notas ?? null,
      tarjeta_id: f.tarjeta_id ?? null,
      cuotas: f.cuotas ?? null,
    })
  }

  return (
    <div className="historial">
      {aviso}
      {h.sinSubir.length > 0 && (
        <>
          <h2>
            En el teléfono, sin subir<small>esperando señal · se suben solos</small>
          </h2>
          {h.sinSubir.map((l) => (
            <Fila key={l.uuid} l={l} onTocar={() => editar(l.uuid)} />
          ))}
        </>
      )}
      <h2>
        Pendientes de bajar a la compu<small>{h.pendientes.length === 0 ? 'nada pendiente' : 'tocá uno para corregirlo'}</small>
      </h2>
      {h.pendientes.length === 0 && filas !== null && <p className="vacio">La computadora ya bajó todo lo que estaba en el buzón.</p>}
      {h.pendientes.map((l) => (
        <Fila key={l.uuid} l={l} onTocar={() => editar(l.uuid)} />
      ))}
      {h.bajados.length > 0 && (
        <>
          <h2>
            Ya en la computadora<small>los últimos {h.bajados.length} · no se tocan desde acá</small>
          </h2>
          {h.bajados.map((l) => (
            <Fila key={l.uuid} l={l} />
          ))}
        </>
      )}
      {nada && filas === null && red === 'sin_red' && <p className="vacio">Sin señal y sin copia guardada: abrilo una vez con señal.</p>}
      {red === 'cargando' && <p className="estado-red">Actualizando…</p>}
      {red === 'sin_red' && de && <p className="estado-red">Sin señal: lo que se ve es de {haceCuanto(de, new Date())}.</p>}
      {red === 'ok' && <p className="estado-red">Al día con el buzón.</p>}
    </div>
  )
}

function Fila({ l, onTocar }: { l: HistorialArmado['pendientes'][number]; onTocar?: () => void }) {
  const clase = `linea ${l.estado === 'sin_subir' ? 'sin-subir' : l.estado} ${l.tipo === 'FAMILIAR' ? 'familiar' : 'haikmaro'}`
  const contenido = (
    <>
      <span className="dia">{fechaCorta(l.fecha)}</span>
      <span className="que">
        {l.categoria}
        {l.detalle && <small>{l.detalle}</small>}
        {l.estado === 'bajado' && l.bajadoEl && <small>bajó el {fechaCorta(l.bajadoEl)}</small>}
      </span>
      <span className="cuanto">
        {l.monto} <small>$</small>
      </span>
      {onTocar && <span className="flecha">›</span>}
    </>
  )
  if (!onTocar) return <div className={clase}>{contenido}</div>
  return (
    <button type="button" className={`${clase} tocable`} onClick={onTocar} aria-label={`Corregir ${l.categoria} ${l.monto}`}>
      {contenido}
    </button>
  )
}
