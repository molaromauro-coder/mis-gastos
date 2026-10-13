-- Append-only backups and optimistic concurrency; no service-role key in clients.
create table public.sync_heads (
  user_id uuid primary key references auth.users(id),
  revision bigint not null check (revision >= 1),
  state jsonb not null check (jsonb_typeof(state->'expenses') = 'array'),
  updated_at timestamptz not null default now()
);
create table public.sync_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  device_id uuid not null,
  revision bigint,
  state jsonb not null check (jsonb_typeof(state->'expenses') = 'array'),
  created_at timestamptz not null default now()
);
alter table public.sync_heads enable row level security;
alter table public.sync_backups enable row level security;
create policy owner_read_heads on public.sync_heads for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert_heads on public.sync_heads for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update_heads on public.sync_heads for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_read_backups on public.sync_backups for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert_backups on public.sync_backups for insert to authenticated with check ((select auth.uid())=user_id);
revoke all on public.sync_heads, public.sync_backups from anon, authenticated;
grant select, insert, update on public.sync_heads to authenticated;
grant select, insert on public.sync_backups to authenticated;
-- Every head update, including writes outside the RPC, preserves its prior value.
create function public.archive_sync_head() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.revision <> old.revision+1 then raise exception 'Invalid revision'; end if;
    insert into public.sync_backups(user_id,device_id,revision,state)
      values(old.user_id,'00000000-0000-0000-0000-000000000000',old.revision,old.state);
  end if;
  return new;
end $$;
revoke all on function public.archive_sync_head() from public, anon, authenticated;
create trigger preserve_sync_head before update on public.sync_heads for each row execute function public.archive_sync_head();
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
