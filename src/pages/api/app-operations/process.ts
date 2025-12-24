import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import {
  validateOperations,
  type Operation,
} from "@/lib/operationValidator";

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
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Process and apply pending operations with validation
 * 
 * This endpoint:
 * 1. Fetches pending operations
 * 2. Validates each operation
 * 3. Only applies valid operations
 * 4. Marks operations as applied or failed
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { appId, accessToken, operationId } = req.body as {
    appId?: string;
    accessToken?: string;
    operationId?: string; // Optional: process specific operation
  };

  if (!accessToken || typeof accessToken !== "string") {
    return res
      .status(401)
      .json({ ok: false, error: "Missing or invalid access token" });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid or expired access token" });
    }

    // Build query for pending operations
    let query = supabaseAdmin
      .from("buildr_app_operations")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (operationId) {
      query = query.eq("id", operationId);
    } else if (appId) {
      query = query.eq("app_id", appId);
    } else {
      return res
        .status(400)
        .json({ ok: false, error: "appId or operationId is required" });
    }

    const { data: operations, error: operationsError } = await query;

    if (operationsError) {
      return res.status(500).json({
        ok: false,
        error: operationsError.message ?? "Failed to fetch operations",
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

    // Process each operation
    for (const operation of operations) {
      try {
        // Step 1: Validate operations
        const validation = await validateOperations(
          operation.app_id,
          operation.operations as Operation[]
        );

        if (!validation.valid) {
          // Mark as failed with validation errors
          await supabaseAdmin
            .from("buildr_app_operations")
            .update({
              status: "failed",
              error_message: validation.errors.join("; "),
            })
            .eq("id", operation.id);

          failed++;
          continue;
        }

        // Step 2: Apply operations (validation passed)
        const applyResult = await applyOperations(
          operation.app_id,
          operation.operations as Operation[]
        );

        if (!applyResult.success) {
          // Mark as failed with application error
          await supabaseAdmin
            .from("buildr_app_operations")
            .update({
              status: "failed",
              error_message: applyResult.error,
            })
            .eq("id", operation.id);

          failed++;
          continue;
        }

        // Step 3: Create version snapshot
        await createVersionSnapshot(
          operation.app_id,
          operation.user_id,
          operation.id,
          operation.chat_message_id || null
        );

        // Step 4: Mark as applied
        await supabaseAdmin
          .from("buildr_app_operations")
          .update({
            status: "applied",
            applied_at: new Date().toISOString(),
          })
          .eq("id", operation.id);

        applied++;
      } catch (err: any) {
        // Mark as failed with exception message
        await supabaseAdmin
          .from("buildr_app_operations")
          .update({
            status: "failed",
            error_message: err?.message ?? "Unexpected error",
          })
          .eq("id", operation.id);

        failed++;
      }
    }

    return res.status(200).json({
      ok: true,
      processed: operations.length,
      applied,
      failed,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}

/**
 * Apply validated operations to app_config
 */
async function applyOperations(
  appId: string,
  operations: Operation[]
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const operation of operations) {
      switch (operation.type) {
        case "add_component":
          await applyAddComponent(appId, operation);
          break;

        case "add_page":
          await applyAddPage(appId, operation);
          break;

        case "update_data_model":
          await applyUpdateDataModel(appId, operation);
          break;

        case "update_theme":
          await applyUpdateTheme(appId, operation);
          break;

        case "add_permission":
          await applyAddPermission(appId, operation);
          break;

        case "update_layout":
          await applyUpdateLayout(appId, operation);
          break;

        case "remove_component":
          await applyRemoveComponent(appId, operation);
          break;

        case "remove_page":
          await applyRemovePage(appId, operation);
          break;

        default:
          return {
            success: false,
            error: `Unknown operation type: ${operation.type}`,
          };
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "Failed to apply operations",
    };
  }
}

/**
 * Apply add_component operation
 */
async function applyAddComponent(appId: string, operation: Operation) {
  const { data: pageConfig } = await supabaseAdmin
    .from("buildr_app_config")
    .select("config_value")
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page)
    .single();

  if (!pageConfig) {
    throw new Error(`Page "${operation.page}" not found`);
  }

  const pageValue = pageConfig.config_value as any;
  if (!pageValue.components) {
    pageValue.components = [];
  }

  // Generate component ID if not provided
  const componentId = operation.component.id || `comp-${Date.now()}`;
  pageValue.components.push({
    id: componentId,
    ...operation.component,
  });

  await supabaseAdmin
    .from("buildr_app_config")
    .update({ config_value: pageValue })
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page);
}

/**
 * Apply add_page operation
 */
async function applyAddPage(appId: string, operation: Operation) {
  await supabaseAdmin.from("buildr_app_config").insert({
    app_id: appId,
    config_type: "page",
    config_key: operation.page.slug,
    config_value: operation.page,
  });
}

/**
 * Apply update_data_model operation
 */
async function applyUpdateDataModel(appId: string, operation: Operation) {
  const existingModel = await supabaseAdmin
    .from("buildr_app_config")
    .select("config_value")
    .eq("app_id", appId)
    .eq("config_type", "data_model")
    .eq("config_key", operation.model)
    .single();

  const modelValue = existingModel.data
    ? { ...(existingModel.data.config_value as any) }
    : { name: operation.model, fields: [] };

  if (operation.fields) {
    modelValue.fields = operation.fields;
  }

  if (existingModel.data) {
    await supabaseAdmin
      .from("buildr_app_config")
      .update({ config_value: modelValue })
      .eq("app_id", appId)
      .eq("config_type", "data_model")
      .eq("config_key", operation.model);
  } else {
    await supabaseAdmin.from("buildr_app_config").insert({
      app_id: appId,
      config_type: "data_model",
      config_key: operation.model,
      config_value: modelValue,
    });
  }
}

/**
 * Apply update_theme operation
 */
async function applyUpdateTheme(appId: string, operation: Operation) {
  await supabaseAdmin
    .from("buildr_app_config")
    .upsert({
      app_id: appId,
      config_type: "schema",
      config_key: "theme",
      config_value: { theme: operation.theme },
    });
}

/**
 * Apply add_permission operation
 */
async function applyAddPermission(appId: string, operation: Operation) {
  const permissions = await supabaseAdmin
    .from("buildr_app_config")
    .select("config_value")
    .eq("app_id", appId)
    .eq("config_type", "permissions")
    .eq("config_key", "rules")
    .single();

  const rules = permissions.data
    ? (permissions.data.config_value as any).rules || []
    : [];

  rules.push(operation.permission);

  await supabaseAdmin
    .from("buildr_app_config")
    .upsert({
      app_id: appId,
      config_type: "permissions",
      config_key: "rules",
      config_value: { rules },
    });
}

/**
 * Apply update_layout operation
 */
async function applyUpdateLayout(appId: string, operation: Operation) {
  await supabaseAdmin
    .from("buildr_app_config")
    .update({
      config_value: {
        ...(operation.page as any),
        layout: operation.layout,
      },
    })
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page);
}

/**
 * Apply remove_component operation
 */
async function applyRemoveComponent(appId: string, operation: Operation) {
  const { data: pageConfig } = await supabaseAdmin
    .from("buildr_app_config")
    .select("config_value")
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page)
    .single();

  if (!pageConfig) {
    throw new Error(`Page "${operation.page}" not found`);
  }

  const pageValue = pageConfig.config_value as any;
  if (pageValue.components) {
    pageValue.components = pageValue.components.filter(
      (c: any) => c.id !== operation.componentId
    );
  }

  await supabaseAdmin
    .from("buildr_app_config")
    .update({ config_value: pageValue })
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page);
}

/**
 * Apply remove_page operation
 */
async function applyRemovePage(appId: string, operation: Operation) {
  await supabaseAdmin
    .from("buildr_app_config")
    .delete()
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page);
}

/**
 * Create a version snapshot of the app config
 * Called after operations are successfully applied
 */
async function createVersionSnapshot(
  appId: string,
  userId: string,
  operationId: string,
  chatMessageId: string | null
) {
  try {
    // Get next version number
    let versionNumber = 1;

    try {
      const { data: versionData, error: versionError } = await supabaseAdmin
        .rpc("buildr_get_next_version_number", { p_app_id: appId });

      if (!versionError && versionData !== null) {
        versionNumber = versionData as number;
      } else {
        throw new Error("RPC failed, using fallback");
      }
    } catch {
      // Fallback: get max version manually
      const { data: maxVersion } = await supabaseAdmin
        .from("buildr_app_versions")
        .select("version_number")
        .eq("app_id", appId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      versionNumber = maxVersion ? maxVersion.version_number + 1 : 1;
    }

    // Fetch current app config as snapshot
    const { data: configs } = await supabaseAdmin
      .from("buildr_app_config")
      .select("*")
      .eq("app_id", appId);

    // Transform to AppConfig format
    const configSnapshot: any = {
      pages: [],
      dataModels: {},
    };

    for (const row of configs || []) {
      const value = row.config_value as any;

      switch (row.config_type) {
        case "page":
          configSnapshot.pages.push({
            id: row.id,
            ...value,
            slug: row.config_key,
          });
          break;

        case "data_model":
          configSnapshot.dataModels[row.config_key] = value;
          break;

        case "schema":
          configSnapshot.schema = value;
          if (value.theme) {
            configSnapshot.theme = value.theme;
          }
          break;

        case "permissions":
          configSnapshot.permissions = value;
          break;

        case "layout":
          if (!configSnapshot.layouts) {
            configSnapshot.layouts = {};
          }
          configSnapshot.layouts[row.config_key] = value;
          break;

        case "component":
          if (!configSnapshot.components) {
            configSnapshot.components = {};
          }
          configSnapshot.components[row.config_key] = value;
          break;
      }
    }

    // Create version snapshot
    await supabaseAdmin.from("buildr_app_versions").insert({
      app_id: appId,
      user_id: userId,
      operation_id: operationId,
      chat_message_id: chatMessageId,
      version_number: versionNumber,
      config_snapshot: configSnapshot,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error creating version snapshot:", err);
    // Don't fail the operation if versioning fails
  }
}

