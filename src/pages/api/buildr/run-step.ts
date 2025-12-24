import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { executeStep as executeStepHandler, type Step } from "@/lib/stepHandlers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SECRET is not set"
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type Data =
  | {
      status: "applied";
      step: any;
    }
  | {
      status: "done";
    }
  | {
      status: "error";
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      status: "error",
      error: "Method not allowed",
    });
  }

  const { app_id } = req.body;

  if (!app_id) {
    return res.status(400).json({
      status: "error",
      error: "Missing app_id",
    });
  }

  try {
    // 1️⃣ Fetch next pending step
    const { data: step, error: fetchError } = await supabaseAdmin
      .from("buildr_execution_steps")
      .select("*")
      .eq("app_id", app_id)
      .eq("status", "pending")
      .order("step_index", { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !step) {
      // No more pending steps for this app
      if (fetchError) {
        console.log("No pending steps found or error:", fetchError);
      }
      return res.status(200).json({ status: "done" });
    }

    console.log("Found pending step:", step.id, step.type || step.step_type, step.step_index);
    console.log("Step object keys:", Object.keys(step));
    console.log("Full step object:", JSON.stringify(step, null, 2));

    // 2️⃣ Mark step as processing
    // Note: started_at and completed_at are optional columns - only update if they exist
    const { error: markProcessingError, data: updateData } = await supabaseAdmin
      .from("buildr_execution_steps")
      .update({
        status: "processing",
      })
      .eq("id", step.id)
      .select();

    if (markProcessingError) {
      console.error("Error marking step as processing:", markProcessingError);
      return res.status(500).json({
        status: "error",
        error: `Failed to mark step as processing: ${markProcessingError.message || JSON.stringify(markProcessingError)}`,
      });
    }

    // Check if update actually affected any rows
    if (!updateData || updateData.length === 0) {
      console.error("No rows updated - step may not exist or was already updated");
      return res.status(500).json({
        status: "error",
        error: "Failed to mark step as processing: No rows updated",
      });
    }

      try {
        // Get build_request_id and user_id from app
        let buildRequestId: string | null = null;
        let userId: string | null = null;
        
        // Get app data (user_id and build_request_id)
        const { data: app } = await supabaseAdmin
          .from("buildr_apps")
          .select("user_id, build_request_id")
          .eq("id", app_id)
          .single();
        
        if (app) {
          userId = app.user_id;
          buildRequestId = app.build_request_id || null;
        }
        
        // If still no buildRequestId and step has operation_id, try to get from operation
        if (!buildRequestId && step.operation_id) {
          const { data: operation } = await supabaseAdmin
            .from("buildr_operations_log")
            .select("build_request_id")
            .eq("id", step.operation_id)
            .single();
          
          if (operation?.build_request_id) {
            buildRequestId = operation.build_request_id;
          }
        }
        
        if (!userId) {
          console.error("App data:", app);
          console.error("Step data:", step);
          return res.status(500).json({
            status: "error",
            error: `Could not determine user_id for app ${app_id}. App data: ${JSON.stringify(app)}`,
          });
        }
        
        console.log(`Executing step for app ${app_id}, user ${userId}, buildRequestId: ${buildRequestId || 'null'}`);
        
        // 3️⃣ Execute step using real handlers
        await executeStep(step, supabaseAdmin, app_id, buildRequestId, userId);

      // 4️⃣ Mark as applied
      const { error: markAppliedError, data: appliedData } = await supabaseAdmin
        .from("buildr_execution_steps")
        .update({
          status: "applied",
        })
        .eq("id", step.id)
        .select();

      if (markAppliedError) {
        console.error("Error marking step as applied:", markAppliedError);
        throw markAppliedError;
      }

      if (!appliedData || appliedData.length === 0) {
        console.error("No rows updated when marking as applied");
        throw new Error("Failed to mark step as applied: No rows updated");
      }

      return res.status(200).json({ status: "applied", step });
    } catch (err: any) {
      // 5️⃣ Mark as failed
      const errorMessage = err?.message ?? "Unknown error";
      console.error("Step execution error:", err);
      console.error("Error details logged above - error_message column not available in table");
      
      // Note: error_message column doesn't exist in this table version
      // Only update status to 'failed'
      const { error: markFailedError } = await supabaseAdmin
        .from("buildr_execution_steps")
        .update({
          status: "failed",
        })
        .eq("id", step.id);

      if (markFailedError) {
        console.error("Error marking step as failed:", markFailedError);
      }

      return res.status(500).json({
        status: "error",
        error: `Step execution failed: ${errorMessage}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      error: err?.message ?? "Unexpected error",
    });
  }
}

// Helper: execute a single step using real step handlers
async function executeStep(step: any, supabase: any, appId: string, buildRequestId: string | null = null, userId: string | null = null) {
  // Column name is "type", but handle both for backwards compatibility
  let stepType = step.type || step.step_type;
  let stepData: any = {};
  
  // If step has operation_id, try to fetch full step data from operations_log
  if (step.operation_id) {
    console.log(`Fetching full step data from operation ${step.operation_id}, step_index ${step.step_index}`);
    const { data: operation, error: operationError } = await supabase
      .from("buildr_operations_log")
      .select("operations")
      .eq("id", step.operation_id)
      .single();
    
    if (operationError) {
      console.error(`Failed to fetch operation ${step.operation_id}:`, operationError);
      throw new Error(`Failed to fetch operation details: ${operationError.message}`);
    }
    
    if (operation && operation.operations && Array.isArray(operation.operations)) {
      // Find the step at step_index
      const fullStep = operation.operations[step.step_index];
      if (fullStep) {
        console.log(`Found step at index ${step.step_index}:`, JSON.stringify(fullStep, null, 2));
        stepType = fullStep.type || stepType;
        stepData = fullStep;
      } else {
        throw new Error(`Step at index ${step.step_index} not found in operation. Operation has ${operation.operations.length} steps.`);
      }
    } else {
      throw new Error(`Operation ${step.operation_id} has invalid operations array`);
    }
  } else {
    // Step doesn't have operation_id - use the step data directly
    // This handles steps that were created directly (not from operations_log)
    console.log(`Step ${step.id} has no operation_id - using step data directly`);
    
    // Extract relevant fields from the step, excluding database metadata
    const { id, app_id, step_index, status, operation_id, created_at, updated_at, started_at, completed_at, error, ...stepFields } = step;
    
    // Use the step's own data - it should have type, target/slug, details, etc.
    stepData = {
      ...stepFields,
      // Map common field aliases
      slug: stepFields.slug || stepFields.target,
      // Include all other fields (details, etc.)
    };
    
    console.log(`Using step data:`, JSON.stringify(stepData, null, 2));
  }
  
  if (!stepType) {
    throw new Error(`Step missing type field. Available fields: ${Object.keys(step).join(", ")}`);
  }
  
  // Construct step object for handler
  // Use stepData from operation_log OR from the step itself if no operation_id
  const handlerStep: Step = {
    type: stepType as "create_model" | "create_page" | "create_component" | "set_permissions",
    ...stepData, // Spread all properties from the full step data or step itself
  };
  
  console.log("Executing step with handler data:", JSON.stringify(handlerStep, null, 2));
  
  // Execute using the real handler (pass buildRequestId and userId if available)
  const result = await executeStepHandler(appId, handlerStep, buildRequestId, userId);
  
  if (!result.success) {
    throw new Error(result.error || "Step execution failed");
  }
  
  return result;
}

