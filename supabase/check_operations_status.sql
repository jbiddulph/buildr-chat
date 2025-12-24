-- Check operations for the app
-- This will help diagnose why expand-operations returned expanded: 0

-- Check all operations for this app (regardless of status)
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

-- Check pending operations specifically (what expand-operations looks for)
SELECT 
  id,
  app_id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND status = 'pending';

-- Check if any execution steps exist (expand-operations skips if steps already exist)
SELECT COUNT(*) as existing_steps_count
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

