-- Diagnostic queries to check why step execution is failing
-- Replace 'YOUR_APP_ID' with: e9aa49f7-61e7-4458-94d3-aa2499329fad

-- Check if execution steps have operation_id set
SELECT 
  id,
  app_id,
  operation_id,
  step_index,
  step_type,
  target,
  status
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index;

-- Check if operations exist for this app
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

-- Check if steps are properly linked to operations
SELECT 
  es.id as step_id,
  es.step_index,
  es.step_type,
  es.target,
  es.status,
  es.operation_id,
  ol.id as operation_exists,
  ol.intent,
  ol.status as operation_status,
  CASE 
    WHEN es.operation_id IS NULL THEN '❌ Missing operation_id'
    WHEN ol.id IS NULL THEN '❌ Operation not found'
    WHEN ol.status != 'pending' THEN '⚠️ Operation status: ' || ol.status
    ELSE '✅ OK'
  END as link_status
FROM public.buildr_execution_steps es
LEFT JOIN public.buildr_operations_log ol ON es.operation_id = ol.id
WHERE es.app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY es.step_index;

-- Check the actual step data in an operation (replace OPERATION_ID)
-- SELECT 
--   id,
--   operations -> 0 as first_step,
--   operations -> 1 as second_step
-- FROM public.buildr_operations_log
-- WHERE id = 'OPERATION_ID_HERE';

