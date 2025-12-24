-- Enable Realtime for buildr_chat_messages table
-- Run this in Supabase SQL Editor if realtime updates aren't working

-- Check if table exists and Realtime publication exists
do $$
begin
  -- Check if supabase_realtime publication exists
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Add buildr_chat_messages to realtime publication if not already added
    begin
      alter publication supabase_realtime add table public.buildr_chat_messages;
      raise notice '✅ Added buildr_chat_messages to supabase_realtime publication';
    exception when others then
      -- Table may already be in publication, ignore error
      raise notice 'ℹ️ buildr_chat_messages may already be in supabase_realtime publication: %', SQLERRM;
    end;
  else
    raise notice '⚠️ supabase_realtime publication does not exist. Realtime may not be enabled for this project.';
  end if;
end $$;

-- Verify the table is in the publication
SELECT 
  schemaname, 
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'buildr_chat_messages';


