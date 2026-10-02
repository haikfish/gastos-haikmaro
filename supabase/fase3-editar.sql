-- ============================================================
-- FASE 3 · Editar y borrar desde el celular lo que TODAVÍA no bajó
-- a la computadora. Pegar entero en SQL Editor y apretar Run.
-- Correrlo dos veces no rompe nada.
--
-- Hasta acá el celular solo podía cargar y ver. Con esto, mientras un
-- gasto esté pendiente (importado_en en null) se puede corregir o
-- borrar desde el historial de la app. Lo que ya bajó es intocable:
-- los datos definitivos viven en la computadora.
-- ============================================================

drop policy if exists gastos_editar on public.gastos;
create policy gastos_editar on public.gastos
  for update to authenticated
  using (importado_en is null)
  with check (importado_en is null);

drop policy if exists gastos_borrar on public.gastos;
create policy gastos_borrar on public.gastos
  for delete to authenticated
  using (importado_en is null);
