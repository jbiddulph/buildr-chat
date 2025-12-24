-- Execution Steps Table
-- Stores individual execution steps for granular progress tracking
-- This table is used by the step runner to track progress of each step within an operation

create table if not exists public.buildr_execution_steps (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.buildr_apps(id) on delete cascade,
  step_index integer not null, -- Order of step execution (0, 1, 2, ...)
  step_type text not null, -- e.g., "create_model", "create_page", "create_component", "set_permissions"
  target text, -- Target of the step (e.g., model name, page slug, component name)
  status text not null default 'pending', -- pending, processing, applied, failed
  error_message text, -- Error details if status is 'failed'
  started_at timestamptz, -- When step execution started
  completed_at timestamptz, -- When step execution completed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add operation_id column if it doesn't exist (for migration from existing table)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_execution_steps' 
    and column_name = 'operation_id'
  ) then
    alter table public.buildr_execution_steps 
    add column operation_id uuid references public.buildr_operations_log(id) on delete cascade;
  end if;
end $$;

-- Grant permissions
grant all on public.buildr_execution_steps to service_role;
grant all on public.buildr_execution_steps to authenticated, anon;

-- Indexes
create index if not exists idx_buildr_execution_steps_app_id 
  on public.buildr_execution_steps(app_id);

-- Create operation_id index only if the column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'buildr_execution_steps' 
    and column_name = 'operation_id'
  ) then
    create index if not exists idx_buildr_execution_steps_operation_id 
    on public.buildr_execution_steps(operation_id);
  end if;
end $$;

create index if not exists idx_buildr_execution_steps_status 
  on public.buildr_execution_steps(status);

create index if not exists idx_buildr_execution_steps_app_step_index 
  on public.buildr_execution_steps(app_id, step_index);

-- Composite index for efficient querying of steps by app ordered by step_index
create index if not exists idx_buildr_execution_steps_app_index 
  on public.buildr_execution_steps(app_id, step_index, created_at);

-- Enable RLS
alter table public.buildr_execution_steps enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow users to read execution steps for their own apps" on public.buildr_execution_steps;
drop policy if exists "Allow service_role full access to execution_steps" on public.buildr_execution_steps;

-- RLS policies for buildr_execution_steps
create policy "Allow users to read execution steps for their own apps"
on public.buildr_execution_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.buildr_apps a
    where a.id = buildr_execution_steps.app_id
      and a.user_id = (select auth.uid())
  )
);

create policy "Allow service_role full access to execution_steps"
on public.buildr_execution_steps
for all
to service_role
using (true)
with check (true);

-- Trigger to update updated_at timestamp
drop trigger if exists update_buildr_execution_steps_updated_at on public.buildr_execution_steps;
create trigger update_buildr_execution_steps_updated_at
  before update on public.buildr_execution_steps
  for each row
  execute function public.buildr_update_updated_at_column();

-- Enable Realtime for buildr_execution_steps
-- This allows real-time updates when steps are processed
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.buildr_execution_steps;
    exception when others then
      -- Table may already be in publication, ignore error
      null;
    end;
  end if;
end $$;

