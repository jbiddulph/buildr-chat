-- Script to diagnose and fix "Unknown" execution steps
-- Replace 'YOUR_APP_ID' with your actual app ID: e9aa49f7-61e7-4458-94d3-aa2499329fad

-- ============================================================================
-- STEP 1: DIAGNOSE - Check what you have
-- ============================================================================

-- Check operations for this app
SELECT 
  id,
  app_id,
  intent,
  status,
  created_at,
  jsonb_array_length(operations) as step_count
FROM public.buildr_operations_log
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY created_at DESC;

-- Check execution steps (especially those with NULL or empty step_type)
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

-- Check if steps are linked to operations
SELECT 
  es.id,
  es.step_index,
  es.step_type,
  es.target,
  es.status,
  es.operation_id,
  ol.intent,
  ol.status as operation_status
FROM public.buildr_execution_steps es
LEFT JOIN public.buildr_operations_log ol ON es.operation_id = ol.id
WHERE es.app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY es.step_index;

-- ============================================================================
-- STEP 2: FIX - Option A: Delete broken steps and reset operations
-- ============================================================================

-- Delete steps with NULL or empty step_type OR missing operation_id
DELETE FROM public.buildr_execution_steps 
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND (
  step_type IS NULL 
  OR step_type = '' 
  OR operation_id IS NULL  -- Also delete steps without operation_id
);

-- Reset operations to pending so they can be expanded again
UPDATE public.buildr_operations_log
SET status = 'pending'
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND status != 'pending';

-- ============================================================================
-- STEP 3: FIX - Option B: Update steps directly from operations (if linked)
-- ============================================================================

-- Update step_type from operations for steps that have operation_id
-- This is more complex and requires extracting the type from the operations array
-- Only use this if Option A doesn't work

UPDATE public.buildr_execution_steps es
SET step_type = (
  SELECT 
    CASE 
      WHEN (ol.operations -> es.step_index ->> 'type') IS NOT NULL 
      THEN (ol.operations -> es.step_index ->> 'type')
      ELSE 'create_component'  -- fallback
    END
  FROM public.buildr_operations_log ol
  WHERE ol.id = es.operation_id
),
target = (
  SELECT 
    COALESCE(
      ol.operations -> es.step_index ->> 'name',
      ol.operations -> es.step_index ->> 'slug',
      ol.operations -> es.step_index ->> 'target',
      'step-' || es.step_index::text
    )
  FROM public.buildr_operations_log ol
  WHERE ol.id = es.operation_id
)
WHERE es.app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
AND es.operation_id IS NOT NULL
AND (es.step_type IS NULL OR es.step_type = '');

-- ============================================================================
-- AFTER FIXING: Verify the fix
-- ============================================================================

-- Check that steps now have proper step_type
SELECT 
  id,
  step_index,
  step_type,
  target,
  status,
  operation_id
FROM public.buildr_execution_steps
WHERE app_id = 'e9aa49f7-61e7-4458-94d3-aa2499329fad'
ORDER BY step_index;

