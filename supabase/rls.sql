alter table public.buildr_chat_messages enable row level security;

create policy "Users can read their own chat messages"
on public.buildr_chat_messages
for select
to authenticated
using (
  exists (
    select 1 from public.buildr_build_requests br
    where br.id = buildr_chat_messages.build_request_id
      and br.user_id = auth.uid()
  )
  or
  exists (
    select 1 from public.buildr_apps a
    where a.id = buildr_chat_messages.app_id
      and a.user_id = auth.uid()
  )
);

create policy "Users can insert chat messages for themselves"
on public.buildr_chat_messages
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Service role full access"
on public.buildr_chat_messages
for all
to service_role
using (true)
with check (true);
