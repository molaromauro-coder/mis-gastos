create function public.commit_sync(p_expected bigint,p_state jsonb,p_device uuid,p_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; next_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user is null or p_user<>auth.uid() then raise exception 'Account changed'; end if;
  if p_state is null or jsonb_typeof(p_state->'expenses') is distinct from 'array'
     or octet_length(p_state::text)>10485760 then raise exception 'Invalid snapshot'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select revision into current_revision from public.sync_heads where user_id=auth.uid() for update;
  if coalesce(current_revision,0)<>p_expected then return jsonb_build_object('conflict',true); end if;
  next_revision:=coalesce(current_revision,0)+1;
  insert into public.sync_backups(user_id,device_id,revision,state) values(auth.uid(),p_device,next_revision,p_state);
  insert into public.sync_heads(user_id,revision,state) values(auth.uid(),next_revision,p_state)
    on conflict(user_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now();
  return jsonb_build_object('conflict',false,'revision',next_revision);
end $$;
revoke all on function public.commit_sync(bigint,jsonb,uuid,uuid) from public, anon;
grant execute on function public.commit_sync(bigint,jsonb,uuid,uuid) to authenticated;

revoke all on function public.commit_sync(bigint,jsonb,uuid) from public,anon,authenticated;
