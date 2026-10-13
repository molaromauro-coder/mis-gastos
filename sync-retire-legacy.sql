-- The old token-only prototype has no records or current app consumers.
-- Retain its table/functions for inspection; disable its overwrite-only public API.
revoke execute on function public.mg_sync_get(text) from public,anon,authenticated;
revoke execute on function public.mg_sync_put(text,jsonb) from public,anon,authenticated;
