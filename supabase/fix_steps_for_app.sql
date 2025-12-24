-- Complete fix script for app: e9aa49f7-61e7-4458-94d3-aa2499329fad
-- Run this in Supabase SQL Editor

-- STEP 1: Check what operations exist
SELECT 
  id,
  app_id,
  intent,
  status,
  jsonb_array_length(operations) as step_count,
  created_at
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC;

-- STEP 2: Check what columns exist in the table
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'buildr_execution_steps'
ORDER BY ordinal_position;

-- STEP 2b: Check current execution steps (using SELECT * to avoid column name issues)
SELECT *
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index
LIMIT 10;

-- STEP 3: Delete ALL execution steps for this app (we'll recreate them properly)
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 4: Reset operations to pending
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 5: Verify operations are ready
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND status = 'pending';

