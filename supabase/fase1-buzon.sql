-- ============================================================
-- FASE 1 · El buzón de gastos — tablas, permisos y categorías
-- Pegar entero en SQL Editor y apretar Run. Correrlo dos veces
-- no rompe nada: borra y rehace (todavía no hay datos que cuidar).
-- ============================================================

drop table if exists public.gastos;
drop table if exists public.categorias;

-- Copia de solo lectura de categorias_gasto del sistema de precios.
-- La computadora manda, el celular solo lee. El celular guarda el ID,
-- nunca el nombre: renombrar una categoría no rompe gastos viejos.
create table public.categorias (
  id integer primary key,
  nombre text not null,
  tipo_gasto text not null check (tipo_gasto in ('HAIKMARO', 'FAMILIAR')),
  balde text check (balde in ('VARIABLE', 'COMISION', 'FIJO')),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

-- El buzón. Cada gasto nace en el celular y muere importado.
create table public.gastos (
  -- Lo genera el celular y es el ancla contra duplicados: reimportar
  -- no duplica aunque el import se corte a la mitad. Sin default a
  -- propósito — si la app olvidara mandarlo, mejor que falle acá.
  uuid uuid primary key,
  tipo_gasto text not null check (tipo_gasto in ('HAIKMARO', 'FAMILIAR')),
  -- null = «Sin categoría» elegida en el celular. El import lo mapea a
  -- la categoría real «Sin categoría» de ese tipo, en la computadora.
  categoria_id integer references public.categorias (id),
  monto numeric(14, 2) not null check (monto > 0),
  fecha date not null,
  -- Sale del login, no del formulario: el celular no puede mentir quién.
  cargado_por text not null default (auth.jwt() ->> 'email'),
  creado_en timestamptz not null default now(),
  -- null = pendiente. Lo marca la computadora al importar.
  importado_en timestamptz
);

-- Para el «hay N gastos nuevos» del arranque.
create index gastos_pendientes on public.gastos (creado_en)
  where importado_en is null;

-- ------------------------------------------------------------
-- Permisos: solo Haik y María logueados. La clave pública sola, nada.
-- ------------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.gastos enable row level security;

-- Sin login (rol anon) no se ve ni la sombra de las tablas.
revoke all on public.categorias from anon;
revoke all on public.gastos from anon;

-- Logueados: leer categorías. Escribirlas no — eso lo hace la
-- computadora con su clave secreta, que no pasa por estas reglas.
create policy categorias_leer on public.categorias
  for select to authenticated using (true);

-- Logueados: cargar gastos y verlos. Ni editar ni borrar: los datos
-- definitivos viven en la computadora; esto es un buzón.
create policy gastos_cargar on public.gastos
  for insert to authenticated
  with check (cargado_por = (auth.jwt() ->> 'email'));

create policy gastos_ver on public.gastos
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Las 42 categorías reales, tal como están hoy en la computadora.
-- La sincronización de la fase 3 las mantiene al día; esto es la
-- foto inicial para que el celular tenga qué mostrar desde el día uno.
-- ------------------------------------------------------------
insert into public.categorias (id, nombre, tipo_gasto, balde, activo) values
  (1, 'Oro', 'HAIKMARO', 'VARIABLE', true),
  (2, 'Plata', 'HAIKMARO', 'VARIABLE', true),
  (3, 'Gemas', 'HAIKMARO', 'VARIABLE', true),
  (4, 'Packaging', 'HAIKMARO', 'VARIABLE', true),
  (5, 'Fundición', 'HAIKMARO', 'VARIABLE', true),
  (6, 'Comisiones', 'HAIKMARO', 'COMISION', true),
  (7, 'Impuestos', 'HAIKMARO', 'COMISION', true),
  (8, 'Alquiler', 'HAIKMARO', 'FIJO', true),
  (9, 'Servicios', 'HAIKMARO', 'FIJO', true),
  (10, 'Publicidad', 'HAIKMARO', 'FIJO', true),
  (11, 'Retiro', 'HAIKMARO', 'FIJO', false),
  (12, 'Herramientas', 'HAIKMARO', 'FIJO', true),
  (13, 'Otros', 'HAIKMARO', 'FIJO', true),
  (14, 'Cochera', 'FAMILIAR', null, true),
  (15, 'Escuela', 'FAMILIAR', null, true),
  (16, 'Monotributo', 'HAIKMARO', 'FIJO', true),
  (17, 'Garage taller', 'HAIKMARO', 'FIJO', true),
  (18, 'Servidor WEB', 'HAIKMARO', 'FIJO', true),
  (19, 'Emilio', 'HAIKMARO', 'FIJO', true),
  (20, 'Chocolates', 'HAIKMARO', 'VARIABLE', true),
  (21, 'Tarjeta de crédito', 'FAMILIAR', null, true),
  (22, 'Celular Maria', 'FAMILIAR', null, true),
  (23, 'Alquiler Niceto', 'FAMILIAR', null, true),
  (24, 'Edenor, luz', 'FAMILIAR', null, true),
  (25, 'Diseño 3D', 'HAIKMARO', 'VARIABLE', true),
  (26, 'Luz, Edesur', 'HAIKMARO', 'FIJO', true),
  (27, 'HAIK personal', 'FAMILIAR', null, true),
  (28, 'MARIA personal', 'FAMILIAR', null, true),
  (29, 'Mercado', 'FAMILIAR', null, true),
  (30, 'Expensas', 'HAIKMARO', 'FIJO', true),
  (31, 'Expensas', 'FAMILIAR', null, true),
  (32, 'ABL', 'HAIKMARO', 'FIJO', true),
  (33, 'ABL', 'FAMILIAR', null, true),
  (34, 'Mercado, Agua, Chino', 'HAIKMARO', 'FIJO', true),
  (35, 'Limpieza', 'HAIKMARO', 'FIJO', true),
  (36, 'Regalos', 'FAMILIAR', null, true),
  (37, 'Salidas', 'FAMILIAR', null, true),
  (38, 'Auto', 'FAMILIAR', null, true),
  (39, 'Swiss medical', 'FAMILIAR', null, true),
  (40, 'gas, mmetrogas', 'FAMILIAR', null, true),
  (41, 'Gym Maria', 'FAMILIAR', null, true),
  (42, 'Aplicaciones, web, internet', 'HAIKMARO', 'FIJO', true),
  (43, 'tarjeta de credito', 'HAIKMARO', 'FIJO', true);

