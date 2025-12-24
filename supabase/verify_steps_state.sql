-- Verify what's actually in the database for your app

-- Check ALL execution steps for this app
SELECT 
  id,
  step_index,
  type,
  target,
  status,
  operation_id,
  created_at
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index;

-- Count steps by operation_id status
SELECT 
  CASE 
    WHEN operation_id IS NULL THEN 'No operation_id'
    ELSE 'Has operation_id'
  END as operation_id_status,
  COUNT(*) as count
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
GROUP BY operation_id_status;

-- Check operations
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

