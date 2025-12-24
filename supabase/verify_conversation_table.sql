-- Quick script to verify and create the buildr_conversation table if it doesn't exist
-- Run this in Supabase SQL Editor if you're getting "table doesn't exist" errors

-- Check if table exists (this will show the table structure if it exists)
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'buildr_conversation'
ORDER BY ordinal_position;

-- If the query above returns no rows, the table doesn't exist
-- Run the following to create it (or run the full public_schema.sql):

-- Create the conversation table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.buildr_conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_request_id uuid REFERENCES public.buildr_build_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  message_type text,
  requires_response boolean NOT NULL DEFAULT false,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add app_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'buildr_conversation' 
    AND column_name = 'app_id'
  ) THEN
    ALTER TABLE public.buildr_conversation 
    ADD COLUMN app_id uuid REFERENCES public.buildr_apps(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.buildr_conversation TO service_role;
GRANT ALL ON public.buildr_conversation TO authenticated, anon;

-- Enable RLS
ALTER TABLE public.buildr_conversation ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Allow authenticated users to insert chat messages" ON public.buildr_conversation;
DROP POLICY IF EXISTS "Allow users to read their own chat messages" ON public.buildr_conversation;
DROP POLICY IF EXISTS "Allow service_role full access to chat messages" ON public.buildr_conversation;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to insert chat messages"
ON public.buildr_conversation
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow users to read their own chat messages"
ON public.buildr_conversation
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.buildr_build_requests b
    WHERE b.id = buildr_conversation.build_request_id
      AND b.user_id = (SELECT auth.uid())
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.buildr_apps a
    WHERE a.id = buildr_conversation.app_id
      AND a.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Allow service_role full access to chat messages"
ON public.buildr_conversation
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_buildr_conversation_build_request_id 
  ON public.buildr_conversation(build_request_id);

CREATE INDEX IF NOT EXISTS idx_buildr_conversation_app_id 
  ON public.buildr_conversation(app_id);

CREATE INDEX IF NOT EXISTS idx_buildr_conversation_user_id 
  ON public.buildr_conversation(user_id);

-- Verify table was created
SELECT 'Table buildr_conversation created successfully!' AS status;


