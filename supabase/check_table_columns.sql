-- Check what columns actually exist in buildr_execution_steps table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'buildr_execution_steps'
ORDER BY ordinal_position;

