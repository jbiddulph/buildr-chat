-- Fix steps missing operation_id for app: e9aa49f7-61e7-4458-94d3-aa2499329fad
-- Based on actual table structure: type, target, details, status, operation_id

-- STEP 1: Check current steps (see which ones have operation_id)
SELECT 
  id,
  step_index,
  type,
  target,
  status,
  operation_id
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index;

-- STEP 2: Check if operations exist
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count,
  created_at
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC;

-- STEP 3: Delete steps without operation_id
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND operation_id IS NULL;

-- OR delete ALL steps to start fresh (safer):
-- DELETE FROM public.buildr_execution_steps 
-- WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 4: Reset operations to pending
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- STEP 5: Verify operations are pending
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND status = 'pending';

