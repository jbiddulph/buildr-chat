create index if not exists idx_buildr_chat_messages_build_request
  on public.buildr_chat_messages(build_request_id);

create index if not exists idx_buildr_chat_messages_app
  on public.buildr_chat_messages(app_id);

create index if not exists idx_buildr_chat_messages_user
  on public.buildr_chat_messages(user_id);

create index if not exists idx_buildr_chat_messages_pending_questions
  on public.buildr_chat_messages(requires_response, answered_at)
  where requires_response = true and answered_at is null;

create index if not exists idx_buildr_chat_messages_created_at
  on public.buildr_chat_messages(created_at);
