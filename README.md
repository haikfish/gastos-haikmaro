# Gastos · Haikmaro

App web chica (PWA) para cargar gastos desde el celular, en la calle. Los
datos definitivos viven en la computadora del atelier: **Supabase es solo el
buzón**, y el sistema de precios lo vacía al importar.

## Cómo funciona

Una pantalla: **tipo → categoría → monto → guardar**. La fecha es la de hoy
(tocable). Quién cargó cada gasto lo pone el servidor según el login.

- **Sin señal no se pierde nada**: el gasto entra a una cola en el teléfono
  ANTES de intentar subir, y se sube solo al volver la conexión. El uuid que
  viaja con cada gasto hace imposible duplicar por reintento.
- **Las categorías las manda la computadora** (sistema de precios). Acá solo
  se eligen; «Sin categoría» existe para el apuro y se asigna después, al
  importar.
- La sesión persiste: se loguea una vez por teléfono.
- **Las categorías van por uso** (v5): las más usadas arriba, contando los
  últimos gastos del buzón (los dos teléfonos) más lo guardado en este
  teléfono. A igual uso, por nombre. «Sin categoría» siempre primera.
- **El color sigue al universo** (v6): Haikmaro en el verde del sistema de
  precios, Familia en dorado. Botones elegidos, GUARDAR y la franja de cada
  línea del historial lo llevan: un vistazo y se sabe dónde se está parado.
- **Buscar categoría escribiendo** (v6): una franja arriba de la grilla,
  sin acentos ni mayúsculas, con que las letras estén en cualquier parte.
- **Corregir y borrar lo pendiente** (v6): en el historial, lo que todavía
  no bajó a la computadora se toca y se abre en el formulario; GUARDAR
  CAMBIOS lo cambia en el teléfono (si no subió) o en el buzón; "borrar este
  gasto" lo saca. Lo que ya bajó no se toca desde acá. Requiere las reglas
  de `supabase/fase3-editar.sql` en el buzón; sin ellas, la app lo dice.
- **Deshacer** (v6): al guardar, la tarjeta de confirmación muestra el
  gasto completo y un botón "Deshacer" durante seis segundos.
- **Historial** (v5): «¿lo anoté o no?». El botón `historial` muestra tres
  franjas: lo que sigue en el teléfono sin subir (esperando señal), lo que
  está en el buzón pendiente de bajar a la computadora, y lo último que ya
  bajó (en gris, con el día en que bajó). Sin señal muestra la última copia
  guardada y dice de cuándo es. Solo lectura: acá no se edita ni se borra.

## Correr en desarrollo

```bash
npm install
npm test        # la lógica: formato de dinero y cola offline
npm run dev
```

El usuario de prueba del desarrollo (`prueba@ejemplo.com`) fue eliminado al
terminar. Para desarrollar de nuevo contra el buzón: crear uno igual en el
panel (Authentication → Add user, con Auto Confirm) — el import del sistema de
precios ignora sus gastos por nombre, así que probar nunca ensucia la
contabilidad.

## Las piezas

| | |
|---|---|
| `src/App.tsx` | la pantalla única, login incluido |
| `src/buzon.ts` | Supabase: auth por supabase-js, datos por fetch pelado |
| `src/logica/` | dinero, cola offline e historial, puras y testeadas |
| `public/sw.js` | el service worker: la app abre sin señal |
| `supabase/fase1-buzon.sql` | las tablas y permisos del buzón, tal como se crearon |
| `supabase/fase3-editar.sql` | las reglas para corregir y borrar lo pendiente desde el celular |

La estética es la del sistema de precios: dorado `#cc9966`, marfil `#fdfaf6`,
Cormorant Garamond para la marca, Inter para lo funcional. Las fuentes van
autoalojadas en `public/fuentes/` — sin red igual se ven.
