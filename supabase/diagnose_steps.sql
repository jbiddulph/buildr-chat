-- Diagnostic queries to check your database structure and step creation

-- 1. Check execution steps structure and data
SELECT 
  id,
  app_id,
  operation_id,
  step_index,
  step_type,
  target,
  status,
  error_message,
  created_at,
  updated_at
FROM public.buildr_execution_steps
ORDER BY app_id, step_index
LIMIT 20;

-- 2. Check if operations_log has entries with step data
SELECT 
  id,
  app_id,
  intent,
  status,
  operations,
  created_at
FROM public.buildr_operations_log
ORDER BY created_at DESC
LIMIT 10;

-- 3. Count execution steps by status for a specific app
-- Replace 'YOUR_APP_ID' with your actual app ID
SELECT 
  status,
  COUNT(*) as count
FROM public.buildr_execution_steps
-- WHERE app_id = 'YOUR_APP_ID'::uuid  -- Uncomment and set your app ID
GROUP BY status;

-- 4. Check if execution steps have operation_id links
SELECT 
  es.id as step_id,
  es.step_type,
  es.target,
  es.status,
  es.operation_id,
  ol.intent,
  ol.status as operation_status,
  ol.operations
FROM public.buildr_execution_steps es
LEFT JOIN public.buildr_operations_log ol ON es.operation_id = ol.id
ORDER BY es.created_at DESC
LIMIT 20;

-- 5. Check what's in buildr_app_spec (the actual app configuration)
SELECT 
  app_id,
  config_type,
  config_key,
  config_value,
  created_at
FROM public.buildr_app_spec
ORDER BY app_id, config_type, created_at
LIMIT 20;


