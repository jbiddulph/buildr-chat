create table if not exists public.buildr_chat_messages (
  id uuid primary key default gen_random_uuid(),

  -- Context
  build_request_id uuid references public.buildr_build_requests(id) on delete cascade,
  app_id uuid references public.buildr_apps(id) on delete cascade,

  -- Ownership & authorship
  user_id uuid not null,
  author_type text not null check (
    author_type in ('user', 'agent', 'system')
  ),

  -- Message classification
  message_type text not null check (
    message_type in (
      'prompt',          -- initial user request
      'reply',           -- normal back-and-forth
      'question',        -- agent needs clarification
      'answer',          -- user response to a question
      'decision',        -- confirmed choice
      'status',          -- progress updates
      'error',           -- something failed
      'explanation'      -- agent explaining an action
    )
  ),

  -- Content
  content text not null,

  -- Async workflow support
  requires_response boolean not null default false,
  answered_at timestamptz,

  -- Optional machine-readable metadata
  metadata jsonb not null default '{}'::jsonb,

  -- Audit
  created_at timestamptz not null default now()
);
