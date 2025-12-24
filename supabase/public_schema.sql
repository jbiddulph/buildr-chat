-- Buildr schema in public schema with buildr_ prefix
-- All tables use public schema with buildr_ prefix
-- This is the consolidated schema file - run this to set up your database

-- Core table to capture app build requests from users
create table if not exists public.buildr_build_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  prompt text not null,
  status text not null default 'pending', -- pending, planning, generating, deploying, deployed, failed
  github_repo_url text,
  vercel_deployment_url text,
  vercel_project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Grant permissions
grant all on public.buildr_build_requests to service_role;
grant all on public.buildr_build_requests to authenticated, anon;

-- Enable RLS
alter table public.buildr_build_requests enable row level security;

-- Drop existing policies if they exist (to allow re-running this script)
drop policy if exists "Allow authenticated users to insert build requests" on public.buildr_build_requests;
drop policy if exists "Allow users to read their own build requests" on public.buildr_build_requests;
drop policy if exists "Allow users to update their own build requests" on public.buildr_build_requests;
drop policy if exists "Allow service_role full access to build requests" on public.buildr_build_requests;

-- RLS policies for buildr_build_requests
create policy "Allow authenticated users to insert build requests"
on public.buildr_build_requests
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Allow users to read their own build requests"
on public.buildr_build_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Allow users to update their own build requests"
on public.buildr_build_requests
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Allow service_role full access to build requests"
on public.buildr_build_requests
for all
to service_role
using (true)
with check (true);

-- Apps table: Each app belongs to a user and has its own identity
-- Must be created before buildr_conversation since it's referenced
create table if not exists public.buildr_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  status text not null default 'pending', -- pending, building, active, archived
  github_repo_url text,
  vercel_deployment_url text,
  vercel_project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Grant permissions
grant all on public.buildr_apps to service_role;
grant all on public.buildr_apps to authenticated, anon;

-- Enable RLS
alter table public.buildr_apps enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow authenticated users to insert their own apps" on public.buildr_apps;
drop policy if exists "Allow users to read their own apps" on public.buildr_apps;
drop policy if exists "Allow users to update their own apps" on public.buildr_apps;
drop policy if exists "Allow service_role full access to apps" on public.buildr_apps;

-- RLS policies for buildr_apps
create policy "Allow authenticated users to insert their own apps"
on public.buildr_apps
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Allow users to read their own apps"
on public.buildr_apps
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Allow users to update their own apps"
on public.buildr_apps
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Allow service_role full access to apps"
on public.buildr_apps
for all
to service_role
using (true)
with check (true);

-- Conversation table: Stores all chat messages and conversation history
-- References both buildr_build_requests and buildr_apps
create table if not exists public.buildr_conversation (
  id uuid primary key default gen_random_uuid(),
  build_request_id uuid references public.buildr_build_requests(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_type text,
  requires_response boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add app_id column if it doesn't exist (for migration from older schema)
-- This handles existing tables that were created without app_id
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_conversation' 
    and column_name = 'app_id'
  ) then
    alter table public.buildr_conversation 
    add column app_id uuid references public.buildr_apps(id) on delete cascade;
  end if;
end $$;

-- Add message_type column if it doesn't exist (for migration from older schema)
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_conversation' 
    and column_name = 'message_type'
  ) then
    alter table public.buildr_conversation 
    add column message_type text;
  end if;
end $$;

-- Add requires_response column if it doesn't exist (for pending questions pattern)
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_conversation' 
    and column_name = 'requires_response'
  ) then
    alter table public.buildr_conversation 
    add column requires_response boolean not null default false;
  end if;
end $$;

-- Add answered_at column if it doesn't exist (for pending questions pattern)
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_conversation' 
    and column_name = 'answered_at'
  ) then
    alter table public.buildr_conversation 
    add column answered_at timestamptz;
  end if;
end $$;

-- Grant permissions
grant all on public.buildr_conversation to service_role;
grant all on public.buildr_conversation to authenticated, anon;

-- Indexes
create index if not exists idx_buildr_conversation_build_request_id 
  on public.buildr_conversation(build_request_id);

create index if not exists idx_buildr_conversation_app_id 
  on public.buildr_conversation(app_id);

create index if not exists idx_buildr_conversation_user_id 
  on public.buildr_conversation(user_id);

-- Index for pending questions pattern: WHERE requires_response = true AND answered_at IS NULL
-- This allows efficient queries to find unanswered agent questions
create index if not exists idx_buildr_conversation_pending_questions 
  on public.buildr_conversation(requires_response, answered_at) 
  where requires_response = true AND answered_at IS NULL;

-- RLS policies for buildr_conversation
alter table public.buildr_conversation enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow authenticated users to insert chat messages" on public.buildr_conversation;
drop policy if exists "Allow users to read their own chat messages" on public.buildr_conversation;
drop policy if exists "Allow service_role full access to chat messages" on public.buildr_conversation;

create policy "Allow authenticated users to insert chat messages"
on public.buildr_conversation
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Allow users to read their own chat messages"
on public.buildr_conversation
for select
to authenticated
using (
  exists (
    select 1
    from public.buildr_build_requests b
    where b.id = buildr_conversation.build_request_id
      and b.user_id = (select auth.uid())
  )
  or
  exists (
    select 1
    from public.buildr_apps a
    where a.id = buildr_conversation.app_id
      and a.user_id = (select auth.uid())
  )
);

create policy "Allow service_role full access to chat messages"
on public.buildr_conversation
for all
to service_role
using (true)
with check (true);

-- App spec table: Stores the desired state - schema, pages, layouts, and data model definitions
-- This is the source of truth for what the app should look like
create table if not exists public.buildr_app_spec (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.buildr_apps(id) on delete cascade,
  config_type text not null check (config_type in ('schema', 'page', 'layout', 'component', 'data_model', 'permissions')),
  config_key text not null, -- e.g., page slug, model name, component name
  config_value jsonb not null, -- The actual config/schema/structure
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_id, config_type, config_key)
);

-- Grant permissions
grant all on public.buildr_app_spec to service_role;
grant all on public.buildr_app_spec to authenticated, anon;

-- Indexes for buildr_app_spec
create index if not exists idx_buildr_app_spec_app_id on public.buildr_app_spec(app_id);
create index if not exists idx_buildr_app_spec_type on public.buildr_app_spec(config_type);
create index if not exists idx_buildr_app_spec_app_type_key on public.buildr_app_spec(app_id, config_type, config_key);

-- Enable RLS
alter table public.buildr_app_spec enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow users to manage config for their own apps" on public.buildr_app_spec;
drop policy if exists "Allow service_role full access to app_spec" on public.buildr_app_spec;

-- RLS policies for buildr_app_spec
create policy "Allow users to manage config for their own apps"
on public.buildr_app_spec
for all
to authenticated
using (
  exists (
    select 1
    from public.buildr_apps a
    where a.id = buildr_app_spec.app_id
      and a.user_id = (select auth.uid())
  )
);

create policy "Allow service_role full access to app_spec"
on public.buildr_app_spec
for all
to service_role
using (true)
with check (true);

-- Operations log table: Stores applied changes and operation history
-- This is a log of all operations that have been applied to the app
create table if not exists public.buildr_operations_log (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.buildr_apps(id) on delete cascade,
  user_id uuid not null,
  conversation_id uuid references public.buildr_conversation(id) on delete set null,
  intent text not null, -- e.g., "modify_ui", "add_page", "update_data_model"
  operations jsonb not null, -- Array of operation objects
  status text not null default 'pending', -- pending, processing, applied, failed
  error_message text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Grant permissions
grant all on public.buildr_operations_log to service_role;
grant all on public.buildr_operations_log to authenticated, anon;

-- Indexes
create index if not exists idx_buildr_operations_log_app_id on public.buildr_operations_log(app_id);
create index if not exists idx_buildr_operations_log_user_id on public.buildr_operations_log(user_id);
create index if not exists idx_buildr_operations_log_status on public.buildr_operations_log(status);
create index if not exists idx_buildr_operations_log_conversation_id on public.buildr_operations_log(conversation_id);

-- Enable RLS
alter table public.buildr_operations_log enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow users to manage operations for their own apps" on public.buildr_operations_log;
drop policy if exists "Allow service_role full access to operations_log" on public.buildr_operations_log;

-- RLS policies for buildr_operations_log
create policy "Allow users to manage operations for their own apps"
on public.buildr_operations_log
for all
to authenticated
using (
  exists (
    select 1
    from public.buildr_apps a
    where a.id = buildr_operations_log.app_id
      and a.user_id = (select auth.uid())
  )
  and user_id = (select auth.uid())
);

create policy "Allow service_role full access to operations_log"
on public.buildr_operations_log
for all
to service_role
using (true)
with check (true);

-- App versions table: History of app states for versioning/undo/revert
-- Every operation that applies changes creates a new version snapshot
create table if not exists public.buildr_app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.buildr_apps(id) on delete cascade,
  user_id uuid not null,
  operation_id uuid references public.buildr_operations_log(id) on delete set null,
  conversation_id uuid references public.buildr_conversation(id) on delete set null,
  version_number integer not null, -- Sequential version number (1, 2, 3, ...)
  spec_snapshot jsonb not null, -- Complete snapshot of buildr_app_spec at this version
  description text, -- Optional description of what changed
  created_at timestamptz not null default now()
);

-- Grant permissions
grant all on public.buildr_app_versions to service_role;
grant all on public.buildr_app_versions to authenticated, anon;

-- Indexes
create index if not exists idx_buildr_app_versions_app_id on public.buildr_app_versions(app_id);
create index if not exists idx_buildr_app_versions_user_id on public.buildr_app_versions(user_id);
create index if not exists idx_buildr_app_versions_version_number on public.buildr_app_versions(app_id, version_number);
create unique index if not exists idx_buildr_app_versions_app_version_unique on public.buildr_app_versions(app_id, version_number);

-- Enable RLS
alter table public.buildr_app_versions enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow users to read versions for their own apps" on public.buildr_app_versions;
drop policy if exists "Allow service_role full access to app_versions" on public.buildr_app_versions;

-- RLS policies for buildr_app_versions
create policy "Allow users to read versions for their own apps"
on public.buildr_app_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.buildr_apps a
    where a.id = buildr_app_versions.app_id
      and a.user_id = (select auth.uid())
  )
);

create policy "Allow service_role full access to app_versions"
on public.buildr_app_versions
for all
to service_role
using (true)
with check (true);

-- Function to automatically update updated_at timestamp
create or replace function public.buildr_update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on buildr_build_requests
drop trigger if exists update_buildr_build_requests_updated_at on public.buildr_build_requests;
create trigger update_buildr_build_requests_updated_at
  before update on public.buildr_build_requests
  for each row
  execute function public.buildr_update_updated_at_column();

-- Trigger to update updated_at on buildr_apps
drop trigger if exists update_buildr_apps_updated_at on public.buildr_apps;
create trigger update_buildr_apps_updated_at
  before update on public.buildr_apps
  for each row
  execute function public.buildr_update_updated_at_column();

-- Trigger to update updated_at on buildr_app_spec
drop trigger if exists update_buildr_app_spec_updated_at on public.buildr_app_spec;
create trigger update_buildr_app_spec_updated_at
  before update on public.buildr_app_spec
  for each row
  execute function public.buildr_update_updated_at_column();

-- Trigger to update updated_at on buildr_operations_log
drop trigger if exists update_buildr_operations_log_updated_at on public.buildr_operations_log;
create trigger update_buildr_operations_log_updated_at
  before update on public.buildr_operations_log
  for each row
  execute function public.buildr_update_updated_at_column();

-- Function to get next version number for an app
create or replace function public.buildr_get_next_version_number(p_app_id uuid)
returns integer as $$
declare
  v_max_version integer;
begin
  select coalesce(max(version_number), 0) into v_max_version
  from public.buildr_app_versions
  where app_id = p_app_id;
  
  return v_max_version + 1;
end;
$$ language plpgsql;

-- Enable Realtime for Buildr tables
-- This allows real-time updates when N8N or other services create/update rows
-- Note: These commands may fail if tables don't exist yet - run after table creation

-- Enable replication for buildr_conversation (chat messages)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_conversation;
    exception when others then
      -- Table may already be in publication, ignore error
      null;
    end;
  end if;
end $$;

-- Enable replication for buildr_app_spec (app configuration/desired state)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_app_spec;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Enable replication for buildr_operations_log (applied operations)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_operations_log;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Enable replication for buildr_app_versions (version snapshots)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_app_versions;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Enable replication for buildr_build_requests (build request status updates)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_build_requests;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Enable replication for buildr_apps (app status updates)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_apps;
    exception when others then
      null;
    end;
  end if;
end $$;
