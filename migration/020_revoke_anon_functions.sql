-- Task’in — 020 : deux fonctions SECURITY DEFINER n’ont pas à être appelables sans connexion
-- (alerte du linter Supabase). Elles restent disponibles pour les utilisateurs connectés.
revoke execute on function public.is_taskin_ops_manager() from anon, public;
revoke execute on function public.taskin_review_ack(uuid) from anon, public;
grant execute on function public.is_taskin_ops_manager() to authenticated;
grant execute on function public.taskin_review_ack(uuid) to authenticated;
