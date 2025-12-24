-- Enable Realtime for Buildr tables
-- This allows real-time updates when N8N or other services create/update rows

-- Enable replication for buildr_conversation (chat messages)
alter publication supabase_realtime add table public.buildr_conversation;

-- Enable replication for buildr_app_spec (app configuration/desired state)
alter publication supabase_realtime add table public.buildr_app_spec;

-- Enable replication for buildr_operations_log (applied operations)
alter publication supabase_realtime add table public.buildr_operations_log;

-- Enable replication for buildr_app_versions (version snapshots)
alter publication supabase_realtime add table public.buildr_app_versions;

-- Enable replication for buildr_build_requests (build request status updates)
alter publication supabase_realtime add table public.buildr_build_requests;

-- Enable replication for buildr_apps (app status updates)
alter publication supabase_realtime add table public.buildr_apps;


