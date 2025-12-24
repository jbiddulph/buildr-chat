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
      app?: any;
      apps?: any[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // For GET requests, read from query params; for POST, read from body
  const accessToken =
    req.method === "GET"
      ? (req.query.accessToken as string | undefined)
      : (req.body?.accessToken as string | undefined);

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

    if (req.method === "GET") {
      // Get all apps for the user
      const { data: apps, error: appsError } = await supabaseAdmin
        .from("buildr_apps")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (appsError) {
        return res.status(500).json({
          ok: false,
          error: appsError.message ?? "Failed to fetch apps",
        });
      }

      return res.status(200).json({
        ok: true,
        apps: apps || [],
      });
    }

    if (req.method === "POST") {
      // Create a new app
      const { name, description } = req.body as {
        name?: string;
        description?: string;
      };

      if (!name || typeof name !== "string" || !name.trim()) {
        return res
          .status(400)
          .json({ ok: false, error: "App name is required" });
      }

      const { data: app, error: insertError } = await supabaseAdmin
        .from("buildr_apps")
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description?.trim() || null,
          status: "pending",
        })
        .select()
        .single();

      if (insertError || !app) {
        return res.status(500).json({
          ok: false,
          error: insertError?.message ?? "Failed to create app",
        });
      }

      return res.status(200).json({
        ok: true,
        app,
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

