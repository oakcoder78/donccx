-- Sales: criar/editar empresas da carteira (comercial_id ou csm_id = auth.uid())
-- Global read já existe (clients_global_select). Escrita segue restrita a carteira.

DROP POLICY IF EXISTS "clients_sales_insert" ON public.clients;
CREATE POLICY "clients_sales_insert"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'sales'
    AND (comercial_id = auth.uid() OR csm_id = auth.uid())
  );

DROP POLICY IF EXISTS "clients_sales_update" ON public.clients;
CREATE POLICY "clients_sales_update"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    public.get_user_role() = 'sales'
    AND (comercial_id = auth.uid() OR csm_id = auth.uid())
  )
  WITH CHECK (
    public.get_user_role() = 'sales'
    AND (comercial_id = auth.uid() OR csm_id = auth.uid())
  );
