import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

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

type OperationJSON = {
  intent: string;
  operations: Array<{
    type: string;
    [key: string]: any;
  }>;
};

type Data =
  | {
      ok: true;
      operation?: any;
      operations?: any[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === "POST") {
    // Store operation JSON from AI agent
    const {
      appId,
      accessToken,
      chatMessageId,
      operationJson,
    } = req.body as {
      appId?: string;
      accessToken?: string;
      chatMessageId?: string;
      operationJson?: OperationJSON;
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

    if (!operationJson || !operationJson.intent || !operationJson.operations) {
      return res.status(400).json({
        ok: false,
        error: "operationJson with intent and operations is required",
      });
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

      // Store the operation
      const operationData: any = {
        app_id: appId,
        user_id: user.id,
        intent: operationJson.intent,
        operations: operationJson.operations,
        status: "pending",
      };

      // Note: The schema uses conversation_id, not chat_message_id
      // If chatMessageId is provided, we can use it as conversation_id
      // (assuming they're the same concept in your system)
      if (chatMessageId) {
        operationData.conversation_id = chatMessageId;
      }

      const { data: operation, error: insertError } = await supabaseAdmin
        .from("buildr_operations_log")
        .insert(operationData)
        .select()
        .single();

      if (insertError || !operation) {
        return res.status(500).json({
          ok: false,
          error: insertError?.message ?? "Failed to store operation",
        });
      }

      return res.status(200).json({
        ok: true,
        operation,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message ?? "Unexpected error",
      });
    }
  }

  if (req.method === "GET") {
    // Get operations for an app
    const { appId, accessToken, status } = req.query as {
      appId?: string;
      accessToken?: string;
      status?: string;
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

      // Fetch operations
      let query = supabaseAdmin
        .from("buildr_operations_log")
        .select("*")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: operations, error: operationsError } = await query;

      if (operationsError) {
        return res.status(500).json({
          ok: false,
          error: operationsError.message ?? "Failed to fetch operations",
        });
      }

      return res.status(200).json({
        ok: true,
        operations: operations || [],
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message ?? "Unexpected error",
      });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

