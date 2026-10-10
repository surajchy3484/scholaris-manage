GRANT EXECUTE ON FUNCTION public.delete_clicker_records(uuid[], uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.delete_clicker_records(uuid[], uuid[]) FROM anon, authenticated;