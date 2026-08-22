/** La conexión con el buzón (Supabase).
 *
 * supabase-js se usa SOLO para el login y la sesión — es lo que hace bien:
 * persistirla y renovar el token solo. Los datos van por fetch pelado, porque
 * la cola offline necesita distinguir con precisión «no hay red» (fetch tira)
 * de «el buzón dijo que no» (status), y el cliente envuelto mezcla los dos.
 *
 * La clave es la publishable: pública por diseño. La seguridad son las reglas
 * del buzón (fase 1), no este archivo.
 */

import { createClient } from '@supabase/supabase-js'

export const URL_BUZON = 'https://xxnasqnphkchdwbxzayf.supabase.co'
export const CLAVE_PUBLICA = 'sb_publishable_LRLZyW2LOy8AFFEfZXpdBQ__7TQY6sb'

export const supabase = createClient(URL_BUZON, CLAVE_PUBLICA)

export type Categoria = {
  id: number
  nombre: string
  tipo_gasto: 'HAIKMARO' | 'FAMILIAR'
  activo: boolean
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** GET al buzón. Devuelve null si no hay red — la señal que la cola espera. */
export async function traerCategorias(): Promise<Categoria[] | null> {
  const t = await token()
  if (!t) return null
  try {
    const r = await fetch(
      `${URL_BUZON}/rest/v1/categorias?select=id,nombre,tipo_gasto,activo&order=nombre`,
      { headers: { apikey: CLAVE_PUBLICA, Authorization: `Bearer ${t}` } },
    )
    return r.ok ? ((await r.json()) as Categoria[]) : null
  } catch {
    return null
  }
}

/** POST de un gasto. Devuelve el status HTTP, o null si no hubo red, y el
 *  código de Postgres si vino en el cuerpo (para el 23505 del duplicado). */
export async function subirGasto(
  gasto: object,
): Promise<{ status: number | null; codigoPg?: string }> {
  const t = await token()
  if (!t) return { status: 401 }
  try {
    const r = await fetch(`${URL_BUZON}/rest/v1/gastos`, {
      method: 'POST',
      headers: {
        apikey: CLAVE_PUBLICA,
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gasto),
    })
    if (r.ok) return { status: r.status }
    const cuerpo = (await r.json().catch(() => ({}))) as { code?: string }
    return { status: r.status, codigoPg: cuerpo.code }
  } catch {
    return { status: null }
  }
}
