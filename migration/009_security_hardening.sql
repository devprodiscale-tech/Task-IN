-- 009 — Durcissement sécurité (bloc A)
-- 1) Fonctions SECURITY DEFINER : plus appelables via /rest/v1/rpc par les visiteurs.
--    Les fonctions de trigger ne sont appelables par personne (un trigger se déclenche sans ce droit).
--    Les fonctions de rôle restent accessibles aux utilisateurs connectés : les règles RLS en ont besoin.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileged_columns() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

revoke execute on function public.current_taskin_role() from public, anon;
revoke execute on function public.is_taskin_admin() from public, anon;
revoke execute on function public.is_taskin_manager() from public, anon;
grant execute on function public.current_taskin_role() to authenticated;
grant execute on function public.is_taskin_admin() to authenticated;
grant execute on function public.is_taskin_manager() to authenticated;

-- 2) Valeurs affichées dans l'interface : on refuse à la source les caractères qui
--    permettraient d'injecter du code (défense en plus de l'échappement côté web app).
alter table public.profiles
  add constraint profiles_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{3,8}$'),
  add constraint profiles_photo_safe
    check (photo is null or photo = ''
      or photo ~ '^https://[^[:space:]"''()<>\\]+$'
      or photo ~ '^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$'),
  add constraint profiles_initials_safe
    check (initials is null or (char_length(initials) <= 4 and initials !~ '[<>"''&`]')),
  add constraint profiles_name_safe
    check (name is null or (char_length(name) <= 120 and name !~ '[<>"`]'));

alter table public.time_entries
  add constraint time_entries_id_safe
    check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  add constraint time_entries_source_safe
    check (source ~ '^[a-z_-]{1,24}$'),
  add constraint time_entries_inbound_safe
    check (inbound_time is null or inbound_time ~ '^([0-9]{2}:[0-9]{2}|--:--)?$');
