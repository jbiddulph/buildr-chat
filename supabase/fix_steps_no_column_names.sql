-- Fix steps without referencing step_type column (since it might not exist)
-- This script works regardless of what columns exist

-- STEP 1: Check what columns actually exist
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'buildr_execution_steps'
ORDER BY ordinal_position;

-- STEP 2: Check current steps (using SELECT * to avoid column name issues)
SELECT *
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index
LIMIT 10;

-- STEP 3: Delete ALL execution steps for this app (safe - we'll recreate them)
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 4: Check if operations exist
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count,
  created_at
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC;

-- STEP 5: Reset operations to pending
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

