-- Simplified fix script - only deletes steps and resets operations
-- Doesn't query step_type since it might not exist

-- Delete all execution steps for your app
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- Reset operations to pending
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

-- Verify operations exist
SELECT 
  id,
  intent,
  status,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad';

