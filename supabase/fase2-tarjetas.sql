-- ============================================================
-- FASE 2 · Tarjetas de crédito — pegar entero en SQL Editor y
-- apretar Run. Correrlo dos veces no rompe nada.
--
-- Un gasto con tarjeta_id NO es un gasto todavía: la computadora
-- lo importa como PENDIENTE (con sus cuotas) y entra a los gastos
-- recién cuando se paga el resumen. tarjeta_id/cuotas en null =
-- contado, el flujo de siempre.
-- ============================================================

-- Copia de solo lectura de las tarjetas del sistema de precios.
-- La computadora manda (upsert por id); el celular solo lee.
create table if not exists public.tarjetas (
  id integer primary key,
  nombre text not null,
  activa boolean not null default true,
  actualizado_en timestamptz not null default now()
);

-- Sin FK a propósito: el buzón es un buzón, no la base de verdad.
-- Una tarjeta que la computadora no reconozca al importar cae a
-- gasto contado visible — jamás un rechazo silencioso del celular.
alter table public.gastos add column if not exists tarjeta_id integer;
alter table public.gastos add column if not exists cuotas integer
  check (cuotas is null or cuotas >= 1);

alter table public.tarjetas enable row level security;
revoke all on public.tarjetas from anon;

drop policy if exists tarjetas_leer on public.tarjetas;
create policy tarjetas_leer on public.tarjetas
  for select to authenticated using (true);
