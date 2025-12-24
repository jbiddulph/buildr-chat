-- Check if steps have step_type values
-- This will help diagnose why steps show as "Unknown"

-- First, check what columns exist
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'buildr_execution_steps'
ORDER BY ordinal_position;

-- Check steps for your app (using SELECT * to see all columns)
SELECT *
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index
LIMIT 20;

-- Check if step_type column exists and what values it has
-- (This will error if step_type doesn't exist, but that's useful info)
SELECT 
  id,
  step_index,
  step_type,  -- This will fail if column doesn't exist
  target,
  status,
  operation_id
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index;

