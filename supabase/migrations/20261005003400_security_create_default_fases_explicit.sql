-- ============================================================================
-- Security — create_default_fases: revogar os grants explicitos
--
-- A migration anterior revogou de PUBLIC, mas a funcao tem grants explicitos
-- (`anon=X/postgres | authenticated=X/postgres`) que vieram da criacao. O
-- revoke de PUBLIC nao os remove.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_default_fases(integer) FROM anon, authenticated;
