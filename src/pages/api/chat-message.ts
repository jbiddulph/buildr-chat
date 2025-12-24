import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Support both naming conventions
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  appId?: string;
};

type Data =
  | {
      ok: true;
      messages: ChatMessage[];
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { appId, buildRequestId, accessToken } = req.query as {
    appId?: string;
    buildRequestId?: string;
    accessToken?: string;
  };

  if (!appId && !buildRequestId) {
    return res
      .status(400)
      .json({ ok: false, error: "appId or buildRequestId is required" });
  }

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

    // If appId is provided, verify the app belongs to this user
    if (appId) {
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

      // Fetch all chat messages for this app
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from("buildr_chat_messages")
        .select("id, role, content, created_at, app_id")
        .eq("app_id", appId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        return res.status(500).json({
          ok: false,
          error: messagesError.message ?? "Failed to fetch messages",
        });
      }

      const formattedMessages: ChatMessage[] = (messages || []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        createdAt: m.created_at,
        appId: m.app_id || undefined,
      }));

      return res.status(200).json({
        ok: true,
        messages: formattedMessages,
      });
    }

    // Legacy: support buildRequestId for backward compatibility
    if (buildRequestId) {
      const { data: buildRequest, error: buildRequestError } =
        await supabaseAdmin
          .from("buildr_build_requests")
          .select("id, user_id")
          .eq("id", buildRequestId)
          .eq("user_id", user.id)
          .single();

      if (buildRequestError || !buildRequest) {
        // Build request doesn't exist - return empty messages instead of error
        // This allows the frontend to handle it gracefully
        return res.status(200).json({
          ok: true,
          messages: [],
        });
      }

      // Fetch all chat messages for this build request
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from("buildr_chat_messages")
        .select("id, role, content, created_at, app_id")
        .eq("build_request_id", buildRequestId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        return res.status(500).json({
          ok: false,
          error: messagesError.message ?? "Failed to fetch messages",
        });
      }

      const formattedMessages: ChatMessage[] = (messages || []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        createdAt: m.created_at,
        appId: m.app_id || undefined,
      }));

      return res.status(200).json({
        ok: true,
        messages: formattedMessages,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}

