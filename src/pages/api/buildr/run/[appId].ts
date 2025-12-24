/**
 * Buildr Step Runner API Route
 * 
 * This endpoint:
 * 1. Fetches pending execution steps for an app (from buildr_operations_log)
 * 2. Executes them sequentially
 * 3. Marks steps as applied or failed
 * 
 * No AI calls - all handlers are deterministic and side-effect isolated
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { executeStep, type Step } from "@/lib/stepHandlers";

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
      processed: number;
      applied: number;
      failed: number;
      results?: Array<{
        operationId: string;
        success: boolean;
        error?: string;
      }>;
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
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { appId } = req.query as { appId?: string };

  if (!appId || typeof appId !== "string") {
    return res.status(400).json({ ok: false, error: "appId is required" });
  }

  // Optional: verify app exists (could also check user permissions here)
  const { data: app, error: appError } = await supabaseAdmin
    .from("buildr_apps")
    .select("id")
    .eq("id", appId)
    .single();

  if (appError || !app) {
    return res.status(404).json({ ok: false, error: "App not found" });
  }

  try {
    // Fetch pending operations (steps) for this app
    const { data: operations, error: fetchError } = await supabaseAdmin
      .from("buildr_operations_log")
      .select("*")
      .eq("app_id", appId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (fetchError) {
      return res.status(500).json({
        ok: false,
        error: `Failed to fetch pending operations: ${fetchError.message}`,
      });
    }

    if (!operations || operations.length === 0) {
      return res.status(200).json({
        ok: true,
        processed: 0,
        applied: 0,
        failed: 0,
      });
    }

    let applied = 0;
    let failed = 0;
    const results: Array<{ operationId: string; success: boolean; error?: string }> = [];

    // Execute steps sequentially
    for (const operation of operations) {
      const operationId = operation.id;
      let operationSuccess = false;
      let operationError: string | undefined;

      try {
        // Mark operation as processing
        await supabaseAdmin
          .from("buildr_operations_log")
          .update({ status: "processing" })
          .eq("id", operationId);

        // Parse operations array from JSONB
        const steps = operation.operations as Step[];

        if (!Array.isArray(steps) || steps.length === 0) {
          operationError = "Invalid operations format: expected array of steps";
          throw new Error(operationError);
        }

        // Execute each step sequentially
        const stepErrors: string[] = [];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];

          if (!step.type) {
            stepErrors.push(`Step ${i + 1}: missing required field 'type'`);
            continue;
          }

          const stepResult = await executeStep(appId, step);

          if (!stepResult.success) {
            stepErrors.push(`Step ${i + 1} (${step.type}): ${stepResult.error}`);
          }
        }

        // If any step failed, mark the operation as failed
        if (stepErrors.length > 0) {
          operationError = stepErrors.join("; ");
          throw new Error(operationError);
        }

        // All steps succeeded - mark operation as applied
        await supabaseAdmin
          .from("buildr_operations_log")
          .update({
            status: "applied",
            applied_at: new Date().toISOString(),
            error_message: null, // Clear any previous errors
          })
          .eq("id", operationId);

        operationSuccess = true;
        applied++;
      } catch (err: any) {
        // Mark operation as failed and log the error
        operationError = err?.message ?? "Unknown error occurred";

        await supabaseAdmin
          .from("buildr_operations_log")
          .update({
            status: "failed",
            error_message: operationError,
          })
          .eq("id", operationId);

        failed++;
      }

      // Track result for response
      results.push({
        operationId,
        success: operationSuccess,
        error: operationError,
      });
    }

    return res.status(200).json({
      ok: true,
      processed: operations.length,
      applied,
      failed,
      results,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}


