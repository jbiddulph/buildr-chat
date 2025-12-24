import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local file
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const appId = process.argv[2] || "e9aa49f7-61e7-4458-94d3-aa2499329fad";

async function checkTables() {
  console.log(`\nChecking operations tables for app: ${appId}\n`);

  // Check buildr_app_operations
  console.log("=== buildr_app_operations ===");
  const { data: appOps, error: appOpsError } = await supabase
    .from("buildr_app_operations")
    .select("id, intent, status, operations, created_at")
    .eq("app_id", appId)
    .order("created_at", { ascending: false });

  if (appOpsError) {
    console.log("Error:", appOpsError.message);
  } else {
    console.log(`Total: ${appOps?.length || 0}`);
    if (appOps && appOps.length > 0) {
      appOps.forEach((op) => {
        const stepCount = Array.isArray(op.operations) ? op.operations.length : 0;
        console.log(`  - ${op.intent} [${op.status}] - ${stepCount} steps (${op.id})`);
      });
    }
  }

  // Check buildr_operations_log
  console.log("\n=== buildr_operations_log ===");
  const { data: opsLog, error: opsLogError } = await supabase
    .from("buildr_operations_log")
    .select("id, intent, status, operations, created_at")
    .eq("app_id", appId)
    .order("created_at", { ascending: false });

  if (opsLogError) {
    console.log("Error:", opsLogError.message);
  } else {
    console.log(`Total: ${opsLog?.length || 0}`);
    if (opsLog && opsLog.length > 0) {
      opsLog.forEach((op) => {
        const stepCount = Array.isArray(op.operations) ? op.operations.length : 0;
        console.log(`  - ${op.intent} [${op.status}] - ${stepCount} steps (${op.id})`);
      });
    }
  }

  // Check execution steps
  console.log("\n=== buildr_execution_steps ===");
  const { data: steps, error: stepsError } = await supabase
    .from("buildr_execution_steps")
    .select("id, step_index, type, target, status, operation_id")
    .eq("app_id", appId)
    .order("step_index", { ascending: true });

  if (stepsError) {
    console.log("Error:", stepsError.message);
  } else {
    console.log(`Total: ${steps?.length || 0}`);
    if (steps && steps.length > 0) {
      const withOpId = steps.filter((s) => s.operation_id).length;
      const withoutOpId = steps.length - withOpId;
      console.log(`  Steps with operation_id: ${withOpId}`);
      console.log(`  Steps without operation_id: ${withoutOpId}`);
      steps.slice(0, 10).forEach((step) => {
        const opIdStatus = step.operation_id ? "✓" : "✗";
        console.log(`  ${opIdStatus} [${step.step_index}] ${step.type} - ${step.target || "N/A"} [${step.status}]`);
      });
      if (steps.length > 10) {
        console.log(`  ... and ${steps.length - 10} more`);
      }
    }
  }

  console.log("\n");
}

checkTables().catch(console.error);

