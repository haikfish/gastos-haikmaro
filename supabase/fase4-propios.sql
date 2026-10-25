-- Fase 4 (26/10/2026, revisión de seguridad): cada uno edita y borra solo sus propios gastos pendientes.
-- Antes, cualquier usuario logueado podía editar o borrar un gasto pendiente de otro, e incluso cambiarle cargado_por.
-- Correr en Supabase → SQL Editor → Run. Es seguro repetirlo.

drop policy if exists gastos_editar on public.gastos;
create policy gastos_editar on public.gastos
  for update to authenticated
  using (importado_en is null and cargado_por = (auth.jwt() ->> 'email'))
  with check (importado_en is null and cargado_por = (auth.jwt() ->> 'email'));

drop policy if exists gastos_borrar on public.gastos;
create policy gastos_borrar on public.gastos
  for delete to authenticated
  using (importado_en is null and cargado_por = (auth.jwt() ->> 'email'));
