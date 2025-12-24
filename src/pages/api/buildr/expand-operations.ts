/**
 * Expand operations from buildr_operations_log into execution steps
 * 
 * This endpoint takes operations from buildr_operations_log and creates
 * individual execution steps in buildr_execution_steps for granular tracking.
 * 
 * POST /api/buildr/expand-operations
 * Body: { appId?: string, operationId?: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
      ok: true;
      expanded: number;
      operationIds: string[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const { appId, operationId } = req.body as {
    appId?: string;
    operationId?: string;
  };

  if (!appId && !operationId) {
    return res.status(400).json({
      ok: false,
      error: "appId or operationId is required",
    });
  }

  try {
    // Fetch pending operations
    let query = supabaseAdmin
      .from("buildr_operations_log")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (operationId) {
      query = query.eq("id", operationId);
    } else if (appId) {
      query = query.eq("app_id", appId);
    }

    const { data: operations, error: operationsError } = await query;

    if (operationsError) {
      return res.status(500).json({
        ok: false,
        error: `Failed to fetch operations: ${operationsError.message}`,
      });
    }

    if (!operations || operations.length === 0) {
      return res.status(200).json({
        ok: true,
        expanded: 0,
        operationIds: [],
      });
    }

    let totalExpanded = 0;
    const processedOperationIds: string[] = [];

    // Expand each operation into execution steps
    for (const operation of operations) {
      const operationsArray = operation.operations as any[];

      if (!Array.isArray(operationsArray) || operationsArray.length === 0) {
        console.warn(`Operation ${operation.id} has no operations array`);
        continue;
      }

      // Check if steps already exist for this operation (with operation_id set)
      // We only skip if steps exist WITH operation_id - steps without operation_id should be replaced
      const { data: existingSteps } = await supabaseAdmin
        .from("buildr_execution_steps")
        .select("id")
        .eq("operation_id", operation.id)
        .eq("app_id", operation.app_id)
        .limit(1);

      if (existingSteps && existingSteps.length > 0) {
        console.log(`Steps already exist for operation ${operation.id} with operation_id, skipping`);
        continue;
      }
      
      // Delete any steps for this app that don't have operation_id (orphaned steps)
      // This ensures we can recreate them properly
      const { error: deleteOrphanError } = await supabaseAdmin
        .from("buildr_execution_steps")
        .delete()
        .eq("app_id", operation.app_id)
        .is("operation_id", null);
      
      if (deleteOrphanError) {
        console.warn(`Warning: Could not delete orphaned steps:`, deleteOrphanError);
        // Continue anyway - we'll try to create the steps
      }

      // Create execution steps for each step in the operation
      const stepsToInsert = operationsArray.map((step, index) => {
        // Extract step type
        const stepType = step.type || "create_component"; // Default fallback

        // Extract target (name, slug, or component name)
        const target =
          step.name ||
          step.slug ||
          step.componentName ||
          step.target ||
          `step-${index}`;

        return {
          app_id: operation.app_id,
          operation_id: operation.id,
          step_index: index,
          type: stepType, // Column name is "type", not "step_type"
          target: target,
          status: "pending",
        };
      });

      const { error: insertError } = await supabaseAdmin
        .from("buildr_execution_steps")
        .insert(stepsToInsert);

      if (insertError) {
        console.error(
          `Failed to insert steps for operation ${operation.id}:`,
          insertError
        );
        continue;
      }

      totalExpanded += stepsToInsert.length;
      processedOperationIds.push(operation.id);

      console.log(
        `Expanded operation ${operation.id} into ${stepsToInsert.length} execution steps`
      );
    }

    return res.status(200).json({
      ok: true,
      expanded: totalExpanded,
      operationIds: processedOperationIds,
    });
  } catch (err: any) {
    console.error("Error expanding operations:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}


