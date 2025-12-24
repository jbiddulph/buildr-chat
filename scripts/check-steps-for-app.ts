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

const appId = process.argv[2] || "23357099-6469-440c-81cb-33f0c0e104e1";

async function checkSteps() {
  console.log(`\nChecking execution steps for app: ${appId}\n`);

  // Check all steps (including failed/completed)
  const { data: steps, error: stepsError } = await supabase
    .from("buildr_execution_steps")
    .select("*")
    .eq("app_id", appId)
    .order("step_index", { ascending: true });
  
  // Also check pending steps specifically
  const { data: pendingSteps } = await supabase
    .from("buildr_execution_steps")
    .select("*")
    .eq("app_id", appId)
    .eq("status", "pending")
    .order("step_index", { ascending: true });

  if (stepsError) {
    console.log("Error:", stepsError.message);
  } else {
    console.log(`Total steps: ${steps?.length || 0}`);
    console.log(`Pending steps: ${pendingSteps?.length || 0}\n`);
    
    if (steps && steps.length > 0) {
      steps.forEach((step) => {
        console.log(`Step ${step.step_index}:`);
        console.log(`  Type: ${step.type || "NULL"}`);
        console.log(`  Target: ${step.target || "N/A"}`);
        console.log(`  Status: ${step.status}`);
        console.log(`  Operation ID: ${step.operation_id || "NULL"}`);
        console.log(`  All fields:`, JSON.stringify(step, null, 2));
        console.log();
      });
    } else {
      console.log("No steps found. Check if operations exist in buildr_operations_log.");
    }
  }
}

checkSteps().catch(console.error);

