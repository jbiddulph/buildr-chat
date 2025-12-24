-- Check what's in both operations tables for your app

-- Replace this with your app_id
-- SET @app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- Check buildr_app_operations
SELECT 
  'buildr_app_operations' as table_name,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing
FROM public.buildr_app_operations
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- Check buildr_operations_log
SELECT 
  'buildr_operations_log' as table_name,
  COUNT(*) as total_count,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- Show sample operations from buildr_app_operations
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count,
  created_at
FROM public.buildr_app_operations
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC
LIMIT 5;

-- Show sample operations from buildr_operations_log
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count,
  created_at
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC
LIMIT 5;

