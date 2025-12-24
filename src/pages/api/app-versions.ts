import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getAppConfigAtVersion } from "@/lib/appConfig";

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
      versions?: any[];
      config?: any;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * GET: List versions for an app
 * POST: Revert to a specific version
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const { appId, accessToken, versionNumber } = req.query as {
    appId?: string;
    accessToken?: string;
    versionNumber?: string;
  };

  if (!accessToken || typeof accessToken !== "string") {
    return res
      .status(401)
      .json({ ok: false, error: "Missing or invalid access token" });
  }

  if (!appId || typeof appId !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "appId is required" });
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

    // Verify app belongs to user
    const { data: app, error: appError } = await supabaseAdmin
      .from("buildr_apps")
      .select("id, user_id")
      .eq("id", appId)
      .eq("user_id", user.id)
      .single();

    if (appError || !app) {
      return res
        .status(404)
        .json({ ok: false, error: "App not found" });
    }

    if (req.method === "GET") {
      // List all versions
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from("buildr_app_versions")
        .select("*")
        .eq("app_id", appId)
        .order("version_number", { ascending: false });

      if (versionsError) {
        return res.status(500).json({
          ok: false,
          error: versionsError.message ?? "Failed to fetch versions",
        });
      }

      return res.status(200).json({
        ok: true,
        versions: versions || [],
      });
    }

    if (req.method === "POST") {
      // Revert to a specific version
      if (!versionNumber || typeof versionNumber !== "string") {
        return res
          .status(400)
          .json({ ok: false, error: "versionNumber is required for POST" });
      }

      const versionNum = parseInt(versionNumber, 10);
      if (isNaN(versionNum)) {
        return res
          .status(400)
          .json({ ok: false, error: "versionNumber must be a number" });
      }

      // Get config at that version
      const config = await getAppConfigAtVersion(appId, versionNum);

      if (!config) {
        return res
          .status(404)
          .json({ ok: false, error: "Version not found" });
      }

      // Delete current config and restore from snapshot
      // This is a simplified revert - in production you might want more sophisticated merging
      await supabaseAdmin
        .from("buildr_app_config")
        .delete()
        .eq("app_id", appId);

      // Restore pages
      for (const page of config.pages || []) {
        await supabaseAdmin.from("buildr_app_config").insert({
          app_id: appId,
          config_type: "page",
          config_key: page.slug,
          config_value: page,
        });
      }

      // Restore data models
      for (const [key, model] of Object.entries(config.dataModels || {})) {
        await supabaseAdmin.from("buildr_app_config").insert({
          app_id: appId,
          config_type: "data_model",
          config_key: key,
          config_value: model,
        });
      }

      // Restore schema
      if (config.schema) {
        await supabaseAdmin.from("buildr_app_config").upsert({
          app_id: appId,
          config_type: "schema",
          config_key: "main",
          config_value: config.schema,
        });
      }

      // Restore permissions
      if (config.permissions) {
        await supabaseAdmin.from("buildr_app_config").upsert({
          app_id: appId,
          config_type: "permissions",
          config_key: "rules",
          config_value: config.permissions,
        });
      }

      // Restore layouts
      if (config.layouts) {
        for (const [key, layout] of Object.entries(config.layouts)) {
          await supabaseAdmin.from("buildr_app_config").insert({
            app_id: appId,
            config_type: "layout",
            config_key: key,
            config_value: layout,
          });
        }
      }

      // Restore components
      if (config.components) {
        for (const [key, component] of Object.entries(config.components)) {
          await supabaseAdmin.from("buildr_app_config").insert({
            app_id: appId,
            config_type: "component",
            config_key: key,
            config_value: component,
          });
        }
      }

      return res.status(200).json({
        ok: true,
        config,
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}

