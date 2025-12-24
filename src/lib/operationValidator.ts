/**
 * Operation Validator
 * 
 * Validates operations before they are applied to the database.
 * This is the safety net that prevents invalid operations from being applied.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export type Operation = {
  type: string;
  [key: string]: any;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validates a single operation
 */
export async function validateOperation(
  appId: string,
  operation: Operation
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Validate operation type
  const validOperationTypes = [
    "add_component",
    "update_theme",
    "add_page",
    "update_data_model",
    "add_permission",
    "update_layout",
    "remove_component",
    "remove_page",
  ];

  if (!validOperationTypes.includes(operation.type)) {
    errors.push(`Invalid operation type: ${operation.type}`);
    return { valid: false, errors };
  }

  // Type-specific validation
  switch (operation.type) {
    case "add_component":
      errors.push(...(await validateAddComponent(appId, operation)));
      break;

    case "add_page":
      errors.push(...(await validateAddPage(appId, operation)));
      break;

    case "update_data_model":
      errors.push(...(await validateUpdateDataModel(appId, operation)));
      break;

    case "update_theme":
      errors.push(...(await validateUpdateTheme(operation)));
      break;

    case "add_permission":
      errors.push(...(await validateAddPermission(appId, operation)));
      break;

    case "update_layout":
      errors.push(...(await validateUpdateLayout(appId, operation)));
      break;

    case "remove_component":
      errors.push(...(await validateRemoveComponent(appId, operation)));
      break;

    case "remove_page":
      errors.push(...(await validateRemovePage(appId, operation)));
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates multiple operations
 */
export async function validateOperations(
  appId: string,
  operations: Operation[]
): Promise<ValidationResult> {
  const allErrors: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    const result = await validateOperation(appId, operation);

    if (!result.valid) {
      allErrors.push(
        `Operation ${i + 1} (${operation.type}): ${result.errors.join(", ")}`
      );
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Validates add_component operation
 */
async function validateAddComponent(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  // Check required fields
  if (!operation.page) {
    errors.push("Missing required field: page");
  }

  if (!operation.component) {
    errors.push("Missing required field: component");
    return errors; // Can't continue validation without component
  }

  if (!operation.component.type) {
    errors.push("Component missing required field: type");
    return errors;
  }

  // Check if page exists
  if (operation.page) {
    const { data: pageConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "page")
      .eq("config_key", operation.page)
      .single();

    if (!pageConfig) {
      errors.push(`Page "${operation.page}" does not exist`);
    }
  }

  // Check if component type exists in component library
  const { data: componentConfig } = await supabaseAdmin
    .from("buildr_app_config")
    .select("id")
    .eq("app_id", appId)
    .eq("config_type", "component")
    .eq("config_key", operation.component.type)
    .single();

  if (!componentConfig) {
    errors.push(
      `Component type "${operation.component.type}" does not exist in component library`
    );
  }

  // If component has a model reference, check if model exists
  if (operation.component.props?.model) {
    const { data: modelConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "data_model")
      .eq("config_key", operation.component.props.model)
      .single();

    if (!modelConfig) {
      errors.push(
        `Data model "${operation.component.props.model}" does not exist`
      );
    }
  }

  return errors;
}

/**
 * Validates add_page operation
 */
async function validateAddPage(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.page) {
    errors.push("Missing required field: page");
    return errors;
  }

  if (!operation.page.slug) {
    errors.push("Page missing required field: slug");
  }

  // Check if page already exists
  if (operation.page.slug) {
    const { data: existingPage } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "page")
      .eq("config_key", operation.page.slug)
      .single();

    if (existingPage) {
      errors.push(`Page with slug "${operation.page.slug}" already exists`);
    }
  }

  // Validate layout exists if specified
  if (operation.page.layout) {
    const { data: layoutConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "layout")
      .eq("config_key", operation.page.layout)
      .single();

    if (!layoutConfig) {
      errors.push(`Layout "${operation.page.layout}" does not exist`);
    }
  }

  return errors;
}

/**
 * Validates update_data_model operation
 */
async function validateUpdateDataModel(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.model) {
    errors.push("Missing required field: model");
    return errors;
  }

  // Validate field definitions
  if (operation.fields && Array.isArray(operation.fields)) {
    const validFieldTypes = [
      "text",
      "number",
      "boolean",
      "date",
      "uuid",
      "jsonb",
      "array",
      "object",
    ];

    for (const field of operation.fields) {
      if (!field.name) {
        errors.push("Field missing required property: name");
      }

      if (field.type && !validFieldTypes.includes(field.type)) {
        errors.push(`Invalid field type: ${field.type}`);
      }
    }
  }

  return errors;
}

/**
 * Validates update_theme operation
 */
function validateUpdateTheme(operation: Operation): string[] {
  const errors: string[] = [];

  if (!operation.theme) {
    errors.push("Missing required field: theme");
    return errors;
  }

  const validThemes = ["light", "dark", "auto"];

  if (!validThemes.includes(operation.theme)) {
    errors.push(`Invalid theme: ${operation.theme}. Must be one of: ${validThemes.join(", ")}`);
  }

  return errors;
}

/**
 * Validates add_permission operation
 */
async function validateAddPermission(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.permission) {
    errors.push("Missing required field: permission");
    return errors;
  }

  // Validate permission structure
  if (!operation.permission.resource) {
    errors.push("Permission missing required field: resource");
  }

  if (!operation.permission.action) {
    errors.push("Permission missing required field: action");
  }

  const validActions = ["read", "write", "delete", "admin"];

  if (
    operation.permission.action &&
    !validActions.includes(operation.permission.action)
  ) {
    errors.push(
      `Invalid action: ${operation.permission.action}. Must be one of: ${validActions.join(", ")}`
    );
  }

  return errors;
}

/**
 * Validates update_layout operation
 */
async function validateUpdateLayout(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.layout) {
    errors.push("Missing required field: layout");
  }

  if (!operation.page) {
    errors.push("Missing required field: page");
  }

  // Check if page exists
  if (operation.page) {
    const { data: pageConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "page")
      .eq("config_key", operation.page)
      .single();

    if (!pageConfig) {
      errors.push(`Page "${operation.page}" does not exist`);
    }
  }

  // Check if layout exists
  if (operation.layout) {
    const { data: layoutConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("id")
      .eq("app_id", appId)
      .eq("config_type", "layout")
      .eq("config_key", operation.layout)
      .single();

    if (!layoutConfig) {
      errors.push(`Layout "${operation.layout}" does not exist`);
    }
  }

  return errors;
}

/**
 * Validates remove_component operation
 */
async function validateRemoveComponent(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.page) {
    errors.push("Missing required field: page");
  }

  if (!operation.componentId) {
    errors.push("Missing required field: componentId");
  }

  // Check if page exists
  if (operation.page) {
    const { data: pageConfig } = await supabaseAdmin
      .from("buildr_app_config")
      .select("config_value")
      .eq("app_id", appId)
      .eq("config_type", "page")
      .eq("config_key", operation.page)
      .single();

    if (!pageConfig) {
      errors.push(`Page "${operation.page}" does not exist`);
    } else if (operation.componentId) {
      // Check if component exists in the page
      const pageValue = pageConfig.config_value as any;
      if (pageValue.components) {
        const componentExists = pageValue.components.some(
          (c: any) => c.id === operation.componentId
        );

        if (!componentExists) {
          errors.push(
            `Component with id "${operation.componentId}" does not exist on page "${operation.page}"`
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validates remove_page operation
 */
async function validateRemovePage(
  appId: string,
  operation: Operation
): Promise<string[]> {
  const errors: string[] = [];

  if (!operation.page) {
    errors.push("Missing required field: page");
    return errors;
  }

  // Check if page exists
  const { data: pageConfig } = await supabaseAdmin
    .from("buildr_app_config")
    .select("id")
    .eq("app_id", appId)
    .eq("config_type", "page")
    .eq("config_key", operation.page)
    .single();

  if (!pageConfig) {
    errors.push(`Page "${operation.page}" does not exist`);
  }

  return errors;
}

