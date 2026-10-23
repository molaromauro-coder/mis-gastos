-- Separate business storage. Existing personal snapshots are never updated here.
create table public.business_owners(user_id uuid primary key references auth.users(id));
alter table public.business_owners enable row level security;
revoke all on public.business_owners from public, anon, authenticated;
grant select on public.business_owners to authenticated;
create policy read_own_business_membership on public.business_owners for select to authenticated using ((select auth.uid())=user_id);
-- Append-only backups and optimistic concurrency; no service-role key in clients.
create table public.business_heads (
  user_id uuid primary key references public.business_owners(user_id),
  revision bigint not null check (revision >= 1),
  state jsonb not null check (coalesce(state->'expenses' = '[]'::jsonb and state->'schemaVersion' = '1'::jsonb and jsonb_typeof(state->'resale'->'parties')='array' and (state - array['schemaVersion','expenses','resale'])='{}'::jsonb,false)),
  updated_at timestamptz not null default now()
);
create table public.business_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.business_owners(user_id),
  device_id uuid not null,
  revision bigint,
  state jsonb not null check (coalesce(state->'expenses' = '[]'::jsonb and state->'schemaVersion' = '1'::jsonb and jsonb_typeof(state->'resale'->'parties')='array' and (state - array['schemaVersion','expenses','resale'])='{}'::jsonb,false)),
  created_at timestamptz not null default now()
);
alter table public.business_heads enable row level security;
alter table public.business_backups enable row level security;
create policy owner_read_heads on public.business_heads for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert_heads on public.business_heads for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update_heads on public.business_heads for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_read_backups on public.business_backups for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert_backups on public.business_backups for insert to authenticated with check ((select auth.uid())=user_id);
revoke all on public.business_heads, public.business_backups from public, anon, authenticated;
grant select, insert, update on public.business_heads to authenticated;
grant select, insert on public.business_backups to authenticated;
-- Every head update, including writes outside the RPC, preserves its prior value.
create function public.archive_business_head() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.revision <> old.revision+1 then raise exception 'Invalid revision'; end if;
    insert into public.business_backups(user_id,device_id,revision,state)
      values(old.user_id,'00000000-0000-0000-0000-000000000000',old.revision,old.state);
  end if;
  return new;
end $$;
revoke all on function public.archive_business_head() from public, anon, authenticated;
create trigger preserve_business_head before update on public.business_heads for each row execute function public.archive_business_head();
create function public.commit_business(p_expected bigint,p_state jsonb,p_device uuid,p_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; next_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.business_owners where user_id=auth.uid()) then raise exception 'Business access denied'; end if;
  if p_user is null or p_user<>auth.uid() then raise exception 'Account changed'; end if;
  if p_state is null or jsonb_typeof(p_state->'expenses') is distinct from 'array'
     or octet_length(p_state::text)>10485760 then raise exception 'Invalid snapshot'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business:'||auth.uid()::text,0));
  select revision into current_revision from public.business_heads where user_id=auth.uid() for update;
  if coalesce(current_revision,0)<>p_expected then return jsonb_build_object('conflict',true); end if;
  next_revision:=coalesce(current_revision,0)+1;
  insert into public.business_backups(user_id,device_id,revision,state) values(auth.uid(),p_device,next_revision,p_state);
  insert into public.business_heads(user_id,revision,state) values(auth.uid(),next_revision,p_state)
    on conflict(user_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now();
  return jsonb_build_object('conflict',false,'revision',next_revision);
end $$;
revoke all on function public.commit_business(bigint,jsonb,uuid,uuid) from public, anon;
grant execute on function public.commit_business(bigint,jsonb,uuid,uuid) to authenticated;
