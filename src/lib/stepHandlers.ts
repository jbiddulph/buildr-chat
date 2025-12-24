/**
 * Step Handlers for Buildr Step Runner
 * 
 * Each handler is deterministic and side-effect isolated.
 * No AI calls - these are pure database operations.
 */

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

export type Step = {
  type: "create_model" | "create_page" | "create_component" | "set_permissions";
  [key: string]: any;
};

export type StepResult = {
  success: boolean;
  error?: string;
  data?: any;
};

/**
 * Execute a step handler based on step type
 */
export async function executeStep(
  appId: string,
  step: Step,
  buildRequestId: string | null = null,
  userId: string | null = null
): Promise<StepResult> {
  switch (step.type) {
    case "create_model":
      return await handleCreateModel(appId, step, buildRequestId, userId);

    case "create_page":
      return await handleCreatePage(appId, step, buildRequestId, userId);

    case "create_component":
      return await handleCreateComponent(appId, step, buildRequestId, userId);

    case "set_permissions":
      return await handleSetPermissions(appId, step, buildRequestId, userId);

    default:
      return {
        success: false,
        error: `Unknown step type: ${step.type}`,
      };
  }
}

/**
 * Handler for create_model step
 * Creates a data model in buildr_app_spec
 * 
 * Expected step format:
 * {
 *   type: "create_model",
 *   name: "ModelName",
 *   fields: [
 *     { name: "field1", type: "text", required: true },
 *     { name: "field2", type: "number", required: false }
 *   ]
 * }
 */
async function handleCreateModel(
  appId: string,
  step: Step,
  buildRequestId: string | null = null,
  userId: string | null = null
): Promise<StepResult> {
  try {
    // Support both 'name' and 'target' field names
    const modelName = step.name || step.target;
    
    // Validate required fields
    if (!modelName || typeof modelName !== "string") {
      return {
        success: false,
        error: `create_model step missing required field: name or target (string). Step data: ${JSON.stringify(step, null, 2)}`,
      };
    }

    // Support fields in step.fields OR step.details.fields
    const fields = step.fields || (step.details && step.details.fields) || [];
    
    if (!Array.isArray(fields) || fields.length === 0) {
      return {
        success: false,
        error: "create_model step missing required field: fields (array) in step.fields or step.details.fields",
      };
    }

    // Validate field structure
    const validFieldTypes = [
      "text",
      "string",  // Support "string" as alias for "text"
      "number",
      "integer", // Support "integer" as alias for "number"
      "boolean",
      "date",
      "datetime", // Support "datetime" as alias for "timestamptz"
      "timestamptz",
      "uuid",
      "reference", // Support "reference" for relationships (stored as uuid)
      "authentication", // Support "authentication" (likely stored as jsonb or uuid)
      "jsonb",
      "array",
      "object",
    ];

    for (const field of fields) {
      if (!field.name || typeof field.name !== "string") {
        return {
          success: false,
          error: `Field missing required property: name (string). Field: ${JSON.stringify(field)}`,
        };
      }

      // Normalize field types (map aliases to canonical types)
      let fieldType = field.type;
      if (fieldType && typeof fieldType === "string") {
        fieldType = fieldType.toLowerCase(); // Normalize to lowercase first
        if (fieldType === "string") fieldType = "text";
        if (fieldType === "integer") fieldType = "number";
        if (fieldType === "datetime") fieldType = "timestamptz";
        if (fieldType === "reference") fieldType = "uuid"; // References are stored as uuid
        if (fieldType === "authentication") fieldType = "jsonb"; // Authentication stored as jsonb
      }
      
      // Check against normalized valid types
      const normalizedValidTypes = ["text", "number", "boolean", "date", "timestamptz", "uuid", "jsonb", "array", "object"];
      if (!fieldType || !normalizedValidTypes.includes(fieldType)) {
        return {
          success: false,
          error: `Invalid field type: ${field.type} (normalized: ${fieldType}). Must be one of: text, string, number, integer, boolean, date, datetime, timestamptz, uuid, reference, authentication, jsonb, array, object`,
        };
      }
    }

    // Check if model already exists
    // Note: Database uses 'architecture' for data models, not 'data_model'
    const { data: existingModel } = await supabaseAdmin
      .from("buildr_app_spec")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "architecture")
      .eq("config_key", modelName)
      .single();

    if (existingModel) {
      return {
        success: false,
        error: `Model "${modelName}" already exists`,
      };
    }

    // Create the model - normalize field types
    const normalizedFields = fields.map((field: any) => {
      let type = field.type;
      if (type && typeof type === "string") {
        type = type.toLowerCase(); // Normalize to lowercase first
        if (type === "string") type = "text";
        if (type === "integer") type = "number";
        if (type === "datetime") type = "timestamptz";
        if (type === "reference") type = "uuid"; // References are stored as uuid, keep relation info
        if (type === "authentication") type = "jsonb"; // Authentication stored as jsonb
      }
      const normalizedField: any = { ...field, type };
      // Preserve relation information if it exists (for reference fields)
      if (field.relation) {
        normalizedField.relation = field.relation;
      }
      return normalizedField;
    });
    
    const modelConfig = {
      name: modelName,
      fields: normalizedFields,
      ...(step.metadata && { metadata: step.metadata }),
      ...(step.details && step.details.description && { description: step.details.description }),
    };

    const insertData: any = {
      app_id: appId,
      config_type: "architecture", // Database allows: 'architecture', 'schema', 'ui', 'permissions'
      config_key: modelName,
      config_value: modelConfig,
    };
    
    // Include user_id if provided (required by schema)
    if (userId) {
      insertData.user_id = userId;
    }
    
    // Include build_request_id if provided
    if (buildRequestId) {
      insertData.build_request_id = buildRequestId;
    }
    
    console.log("Inserting model with data:", JSON.stringify(insertData, null, 2));
    
    const { error: insertError } = await supabaseAdmin
      .from("buildr_app_spec")
      .insert(insertData);

    if (insertError) {
      return {
        success: false,
        error: `Failed to create model: ${insertError.message}`,
      };
    }

    return {
      success: true,
      data: { modelName: modelName, fields: normalizedFields.length },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `create_model error: ${err?.message ?? "Unknown error"}`,
    };
  }
}

/**
 * Handler for create_page step
 * Creates a page in buildr_app_spec
 * 
 * Expected step format:
 * {
 *   type: "create_page",
 *   slug: "page-slug",
 *   title: "Page Title",
 *   layout?: "layout-name",
 *   components?: [...]
 * }
 */
async function handleCreatePage(
  appId: string,
  step: Step,
  buildRequestId: string | null = null,
  userId: string | null = null
): Promise<StepResult> {
  try {
    // Support both 'slug' and 'target' field names
    const slug = step.slug || step.target;
    
    // Validate required fields
    if (!slug || typeof slug !== "string") {
      return {
        success: false,
        error: "create_page step missing required field: slug or target (string)",
      };
    }

    // Check if page already exists
    // Note: Database uses 'ui' for pages, not 'page'
    const { data: existingPage } = await supabaseAdmin
      .from("buildr_app_spec")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "ui")
      .eq("config_key", slug)
      .single();

    if (existingPage) {
      return {
        success: false,
        error: `Page with slug "${step.slug}" already exists`,
      };
    }

    // Validate layout exists if specified
    // Note: Layouts might be stored under 'ui' or 'schema' depending on your structure
    if (step.layout) {
      const { data: layoutConfig } = await supabaseAdmin
        .from("buildr_app_spec")
        .select("id")
        .eq("app_id", appId)
        .eq("config_type", "ui") // Database uses 'ui' for layouts too
        .eq("config_key", step.layout)
        .single();

      if (!layoutConfig) {
        return {
          success: false,
          error: `Layout "${step.layout}" does not exist`,
        };
      }
    }

    // Create the page config
    // Support 'details' field - if present, include it in metadata or merge with config
    const pageConfig: any = {
      slug: slug,
      title: step.title || slug,
      ...(step.layout && { layout: step.layout }),
      components: step.components || [],
      ...(step.metadata && { metadata: step.metadata }),
    };

    // If 'details' is provided, include it in the config
    // This allows for custom page structures like sections
    if (step.details) {
      pageConfig.details = step.details;
      // If details has sections, we can also try to convert them to components if needed
      if (step.details.sections && Array.isArray(step.details.sections)) {
        // Store sections in metadata for now, or you could transform them to components
        if (!pageConfig.metadata) {
          pageConfig.metadata = {};
        }
        pageConfig.metadata.sections = step.details.sections;
      }
    }

    const insertData: any = {
      app_id: appId,
      config_type: "ui", // Database allows: 'architecture', 'schema', 'ui', 'permissions'
      config_key: slug,
      config_value: pageConfig,
    };
    
    // Include user_id if provided (required by schema)
    if (userId) {
      insertData.user_id = userId;
    }
    
    // Include build_request_id if provided
    if (buildRequestId) {
      insertData.build_request_id = buildRequestId;
    }
    
    const { error: insertError } = await supabaseAdmin
      .from("buildr_app_spec")
      .insert(insertData);

    if (insertError) {
      return {
        success: false,
        error: `Failed to create page: ${insertError.message}`,
      };
    }

    return {
      success: true,
      data: { slug: slug, title: pageConfig.title },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `create_page error: ${err?.message ?? "Unknown error"}`,
    };
  }
}

/**
 * Handler for create_component step
 * Creates a component definition in buildr_app_spec
 * 
 * Expected step format:
 * {
 *   type: "create_component",
 *   name: "ComponentName",
 *   componentType: "Button" | "Form" | "Table" | etc,
 *   props?: {...},
 *   pageSlug?: "page-slug" // If adding to a specific page
 * }
 */
async function handleCreateComponent(
  appId: string,
  step: Step,
  buildRequestId: string | null = null,
  userId: string | null = null
): Promise<StepResult> {
  try {
    // Support both 'name' and 'target' field names
    const componentName = step.name || step.target;
    
    // Validate required fields
    if (!componentName || typeof componentName !== "string") {
      return {
        success: false,
        error: "create_component step missing required field: name or target (string)",
      };
    }

    // componentType might be in step.componentType or we can infer from details
    const componentType = step.componentType || "Component";

    if (typeof componentType !== "string") {
      return {
        success: false,
        error: "create_component step missing required field: componentType (string)",
      };
    }

    // If adding to a page, validate the page exists
    // Note: Database uses 'ui' for pages, not 'page'
    if (step.pageSlug) {
      const { data: pageConfig } = await supabaseAdmin
        .from("buildr_app_spec")
        .select("config_value")
        .eq("app_id", appId)
        .eq("config_type", "ui")
        .eq("config_key", step.pageSlug)
        .single();

      if (!pageConfig) {
        return {
          success: false,
          error: `Page "${step.pageSlug}" does not exist`,
        };
      }
    }

    // Create component definition in component library
    const componentConfig = {
      name: componentName,
      type: componentType,
      ...(step.props && { props: step.props }),
      ...(step.metadata && { metadata: step.metadata }),
      ...(step.details && { details: step.details }),
    };

    const upsertData: any = {
      app_id: appId,
      config_type: "ui", // Database allows: 'architecture', 'schema', 'ui', 'permissions' (components go in 'ui')
      config_key: componentName,
      config_value: componentConfig,
    };
    
    // Include user_id if provided (required by schema)
    if (userId) {
      upsertData.user_id = userId;
    }
    
    // Include build_request_id if provided
    if (buildRequestId) {
      upsertData.build_request_id = buildRequestId;
    }
    
    const { error: componentError } = await supabaseAdmin
      .from("buildr_app_spec")
      .upsert(upsertData, { onConflict: "app_id,config_type,config_key" });

    if (componentError) {
      return {
        success: false,
        error: `Failed to create component: ${componentError.message}`,
      };
    }

    // If pageSlug is provided, also add the component to that page
    if (step.pageSlug) {
      const { data: pageConfig } = await supabaseAdmin
        .from("buildr_app_spec")
        .select("config_value")
        .eq("app_id", appId)
        .eq("config_type", "ui") // Database uses 'ui' for pages
        .eq("config_key", step.pageSlug)
        .single();

      if (pageConfig) {
        const pageValue = pageConfig.config_value as any;
        if (!pageValue.components) {
          pageValue.components = [];
        }

        // Generate component instance ID if not provided
        const componentId = step.componentId || `${componentName}-${Date.now()}`;
        pageValue.components.push({
          id: componentId,
          type: componentType,
          name: componentName,
          ...(step.props && { props: step.props }),
        });

        const { error: updateError } = await supabaseAdmin
          .from("buildr_app_spec")
          .update({ config_value: pageValue })
          .eq("app_id", appId)
          .eq("config_type", "ui") // Database uses 'ui' for pages
          .eq("config_key", step.pageSlug);

        if (updateError) {
          return {
            success: false,
            error: `Failed to add component to page: ${updateError.message}`,
          };
        }
      }
    }

    return {
      success: true,
      data: {
        componentName: componentName,
        componentType: componentType,
        addedToPage: !!step.pageSlug,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `create_component error: ${err?.message ?? "Unknown error"}`,
    };
  }
}

/**
 * Handler for set_permissions step
 * Sets permissions for the app
 * 
 * Expected step format:
 * {
 *   type: "set_permissions",
 *   permissions: [
 *     { resource: "model-name", action: "read|write|delete|admin", role?: "user|admin|public" }
 *   ]
 * }
 */
async function handleSetPermissions(
  appId: string,
  step: Step,
  buildRequestId: string | null = null,
  userId: string | null = null
): Promise<StepResult> {
  try {
    console.log("handleSetPermissions received step:", JSON.stringify(step, null, 2));
    console.log("step.details:", JSON.stringify(step.details, null, 2));
    
    // Support permissions in multiple formats:
    // 1. step.permissions (array of permission objects)
    // 2. step.details.access_rules (array of action strings)
    // 3. step.details.permissions (array of permission objects)
    // 4. step.details.rules (array of permission objects)
    let permissions = step.permissions;
    
    // Check details for permissions in various formats
    if (!permissions && step.details) {
      const resource = step.target || step.name || step.slug || "resource";
      
      // Format 1: details.access_rules (array of strings like ["read", "write"])
      if (step.details.access_rules && Array.isArray(step.details.access_rules)) {
        console.log(`Transforming access_rules to permissions for resource: ${resource}`);
        permissions = step.details.access_rules.map((action: string) => ({
          resource: resource,
          action: action,
          role: "user", // Default role
        }));
        console.log("Transformed permissions from access_rules:", JSON.stringify(permissions, null, 2));
      }
      // Format 2: details.permissions (array of permission objects)
      else if (step.details.permissions && Array.isArray(step.details.permissions)) {
        console.log(`Using permissions from details.permissions`);
        permissions = step.details.permissions;
        console.log("Permissions from details.permissions:", JSON.stringify(permissions, null, 2));
      }
      // Format 3: details.rules (array of permission objects)
      else if (step.details.rules && Array.isArray(step.details.rules)) {
        console.log(`Using permissions from details.rules`);
        permissions = step.details.rules;
        console.log("Permissions from details.rules:", JSON.stringify(permissions, null, 2));
      }
      // Format 4: details itself is an array of permissions
      else if (Array.isArray(step.details)) {
        console.log(`Using details as permissions array`);
        permissions = step.details;
        console.log("Permissions from details array:", JSON.stringify(permissions, null, 2));
      }
    }
    
    // Validate required fields
    if (!permissions || !Array.isArray(permissions)) {
      // Log the full details structure to help debug
      const detailsKeys = step.details ? Object.keys(step.details) : [];
      const detailsValues = step.details ? JSON.stringify(step.details, null, 2) : "null";
      return {
        success: false,
        error: `set_permissions step missing required field: permissions (array) or details.access_rules/permissions/rules (array). Step data: ${JSON.stringify({ 
          hasPermissions: !!step.permissions,
          hasDetails: !!step.details,
          detailsKeys: detailsKeys,
          detailsContent: detailsValues,
          hasAccessRules: !!(step.details && step.details.access_rules),
          hasDetailsPermissions: !!(step.details && step.details.permissions),
          hasDetailsRules: !!(step.details && step.details.rules),
          stepKeys: Object.keys(step)
        }, null, 2)}`,
      };
    }

    const validActions = ["read", "write", "delete", "admin", "create", "update"]; // Added create and update
    const validRoles = ["user", "admin", "public", "authenticated"];

    // Validate permission structure
    for (const permission of permissions) { // Use the transformed permissions variable
      if (!permission.resource || typeof permission.resource !== "string") {
        return {
          success: false,
          error: `Permission missing required field: resource (string). Permission: ${JSON.stringify(permission)}`,
        };
      }

      if (!permission.action || !validActions.includes(permission.action)) {
        return {
          success: false,
          error: `Invalid action: ${permission.action}. Must be one of: ${validActions.join(", ")}`,
        };
      }

      if (permission.role && !validRoles.includes(permission.role)) {
        return {
          success: false,
          error: `Invalid role: ${permission.role}. Must be one of: ${validRoles.join(", ")}`,
        };
      }
    }

    // Get existing permissions
    const { data: existingPermissions } = await supabaseAdmin
      .from("buildr_app_spec")
      .select("config_value")
      .eq("app_id", appId)
      .eq("config_type", "permissions")
      .eq("config_key", "rules")
      .single();

    const existingRules = existingPermissions
      ? (existingPermissions.config_value as any).rules || []
      : [];

    // Merge new permissions (replace if resource+action+role matches)
    const mergedRules = [...existingRules];

    for (const newPermission of permissions) { // Use the transformed permissions variable
      const existingIndex = mergedRules.findIndex(
        (rule: any) =>
          rule.resource === newPermission.resource &&
          rule.action === newPermission.action &&
          rule.role === (newPermission.role || "user")
      );

      if (existingIndex >= 0) {
        // Update existing rule
        mergedRules[existingIndex] = newPermission;
      } else {
        // Add new rule
        mergedRules.push(newPermission);
      }
    }

    // Upsert permissions
    const upsertData: any = {
      app_id: appId,
      config_type: "permissions",
      config_key: "rules",
      config_value: { rules: mergedRules },
    };
    
    // Include user_id if provided (required by schema)
    if (userId) {
      upsertData.user_id = userId;
    }
    
    // Include build_request_id if provided
    if (buildRequestId) {
      upsertData.build_request_id = buildRequestId;
    }
    
    const { error: upsertError } = await supabaseAdmin
      .from("buildr_app_spec")
      .upsert(upsertData, { onConflict: "app_id,config_type,config_key" });

    if (upsertError) {
      return {
        success: false,
        error: `Failed to set permissions: ${upsertError.message}`,
      };
    }

    return {
      success: true,
      data: { rulesCount: mergedRules.length },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `set_permissions error: ${err?.message ?? "Unknown error"}`,
    };
  }
}


