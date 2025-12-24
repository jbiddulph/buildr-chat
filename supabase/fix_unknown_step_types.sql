-- Fix "Unknown" step types for app: e9aa49f7-61e7-4458-94d3-aa2499329fad
-- NOTE: This script assumes step_type column exists. If you get a column doesn't exist error,
-- use fix_steps_no_column_names.sql instead which works regardless of column names.

-- STEP 1: Check what columns exist first
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'buildr_execution_steps'
ORDER BY ordinal_position;

-- STEP 1b: Check what we have (using SELECT * to avoid column name errors)
SELECT *
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index
LIMIT 10;

-- STEP 2: Check if operations exist
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 3: Delete ALL steps (safe - we'll recreate them properly with expand-operations)
-- This is the safest approach when we don't know the exact column structure
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 4: Reset operations to pending
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

