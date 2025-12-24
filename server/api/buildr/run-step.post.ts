import { serverSupabaseClient } from '#supabase/server'
import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { app_id } = body

  if (!app_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing app_id',
    })
  }

  const supabase = await serverSupabaseClient(event)

  // 1️⃣ Fetch next pending step
  const { data: step, error: fetchError } = await supabase
    .from('buildr_execution_steps')
    .select('*')
    .eq('app_id', app_id)
    .eq('status', 'pending')
    .order('step_index', { ascending: true })
    .limit(1)
    .single()

  if (fetchError || !step) {
    // No more pending steps for this app
    return { status: 'done' }
  }

  // 2️⃣ Mark step as processing
  const { error: markProcessingError } = await supabase
    .from('buildr_execution_steps')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('id', step.id)

  if (markProcessingError) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to mark step as processing',
    })
  }

  try {
    // 3️⃣ Execute step (SIMULATED for now)
    await executeStep(step, supabase)

    // 4️⃣ Mark as applied
    const { error: markAppliedError } = await supabase
      .from('buildr_execution_steps')
      .update({
        status: 'applied',
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', step.id)

    if (markAppliedError) {
      throw markAppliedError
    }

    return { status: 'applied', step }
  } catch (err: any) {
    // 5️⃣ Mark as failed
    const errorMessage = err?.message ?? 'Unknown error'
    await supabase
      .from('buildr_execution_steps')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', step.id)

    throw createError({
      statusCode: 500,
      statusMessage: `Step execution failed: ${errorMessage}`,
    })
  }
})

// Helper: execute a single step (simulation for now)
async function executeStep(step: any, supabase: any) {
  switch (step.step_type) {
    case 'create_model':
      // TODO: implement create_model behavior
      // For now: simulate
      await new Promise(resolve => setTimeout(resolve, 500))
      return

    case 'create_page':
      // TODO: implement create_page behavior
      // For now: simulate
      await new Promise(resolve => setTimeout(resolve, 500))
      return

    case 'create_component':
      // TODO: implement create_component behavior
      // For now: simulate
      await new Promise(resolve => setTimeout(resolve, 500))
      return

    case 'set_permissions':
      // TODO: implement set_permissions behavior
      // For now: simulate
      await new Promise(resolve => setTimeout(resolve, 500))
      return

    default:
      throw new Error(`Unknown step type: ${step.step_type}`)
  }
}


