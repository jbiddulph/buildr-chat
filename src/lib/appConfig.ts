/**
 * App Config Utilities
 * 
 * Fetches app configuration from Supabase and provides utilities for rendering.
 * The UI does zero guessing - it just fetches config and renders it.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PageConfig = {
  id: string;
  slug: string;
  title: string;
  layout?: string;
  components?: ComponentConfig[];
  [key: string]: any;
};

export type ComponentConfig = {
  id: string;
  type: string;
  props?: Record<string, any>;
  [key: string]: any;
};

export type DataModelConfig = {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    required?: boolean;
    [key: string]: any;
  }>;
  [key: string]: any;
};

export type AppConfig = {
  pages: PageConfig[];
  dataModels: Record<string, DataModelConfig>;
  theme?: string;
  schema?: Record<string, any>;
  permissions?: Record<string, any>;
  layouts?: Record<string, any>;
  components?: Record<string, any>;
};

/**
 * Get complete app configuration
 * 
 * This is what the UI uses to render - no guessing, just fetch and render.
 */
export async function getAppConfig(appId: string): Promise<AppConfig | null> {
  try {
    const { data: configs, error } = await supabase
      .from("buildr_app_spec")
      .select("*")
      .eq("app_id", appId);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching app config:", error);
      return null;
    }

    if (!configs || configs.length === 0) {
      return {
        pages: [],
        dataModels: {},
      };
    }

    // Transform flat config rows into structured config object
    const config: AppConfig = {
      pages: [],
      dataModels: {},
    };

    for (const row of configs) {
      const value = row.config_value as any;

      switch (row.config_type) {
        case "ui":
          // Check if this is a page (has slug or name matching config_key) or a component
          // Pages are stored with config_key as the slug
          // Components would be stored differently, but for now we'll treat all 'ui' items as pages
          // TODO: Distinguish between pages and components in 'ui' type
          config.pages.push({
            id: row.id,
            ...value,
            slug: row.config_key,
          });
          break;

        case "page":
          // Legacy support for old 'page' type
          config.pages.push({
            id: row.id,
            ...value,
            slug: row.config_key,
          });
          break;

        case "architecture":
          // Data models are stored with config_type: "architecture"
          config.dataModels[row.config_key] = value as DataModelConfig;
          break;

        case "data_model":
          // Legacy support for old 'data_model' type
          config.dataModels[row.config_key] = value as DataModelConfig;
          break;

        case "schema":
          config.schema = value;
          if (value.theme) {
            config.theme = value.theme;
          }
          break;

        case "permissions":
          config.permissions = value;
          break;

        case "layout":
          if (!config.layouts) {
            config.layouts = {};
          }
          config.layouts[row.config_key] = value;
          break;

        case "component":
          if (!config.components) {
            config.components = {};
          }
          config.components[row.config_key] = value;
          break;
      }
    }

    // Sort pages by created_at or order if available
    config.pages.sort((a, b) => {
      // You can add ordering logic here if pages have an order field
      return 0;
    });

    return config;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error in getAppConfig:", err);
    return null;
  }
}

/**
 * Get app config at a specific version
 */
export async function getAppConfigAtVersion(
  appId: string,
  versionNumber: number
): Promise<AppConfig | null> {
  try {
    const { data: version, error } = await supabase
      .from("buildr_app_versions")
      .select("config_snapshot")
      .eq("app_id", appId)
      .eq("version_number", versionNumber)
      .single();

    if (error || !version) {
      // eslint-disable-next-line no-console
      console.error("Error fetching app version:", error);
      return null;
    }

    // The snapshot is already in the correct format
    return version.config_snapshot as AppConfig;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error in getAppConfigAtVersion:", err);
    return null;
  }
}

/**
 * Get all versions for an app
 */
export async function getAppVersions(appId: string) {
  try {
    const { data: versions, error } = await supabase
      .from("buildr_app_versions")
      .select("*")
      .eq("app_id", appId)
      .order("version_number", { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching app versions:", error);
      return [];
    }

    return versions || [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error in getAppVersions:", err);
    return [];
  }
}

