import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Support both naming conventions
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

// Webhook URL for app builder (new app creation from /app-builder)
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ??
  "https://n8n.neurohub.uk/webhook/a4f37487-2f34-4ec7-8add-0c412176a6c2";

// Webhook URL for app enhancement workflow (existing app chat from /app/[appId]/chat)
const N8N_APP_WEBHOOK_URL =
  process.env.N8N_APP_WEBHOOK_URL ??
  "https://n8n.neurohub.uk/webhook-test/22890934-91d0-4e9e-9d05-e5bd72cd6365";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type Data =
  | {
      ok: true;
      appId?: string | null;
      buildRequestId?: string | null;
      createdAt: string;
      isNew?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { prompt, accessToken, appId, buildRequestId, role } = req.body as {
    prompt?: string;
    accessToken?: string;
    appId?: string;
    buildRequestId?: string;
    role?: "user" | "assistant" | "system";
  };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res
      .status(400)
      .json({ ok: false, error: "Prompt is required and must be a string" });
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

    let appIdToUse: string | null = null;
    let buildRequestIdToUse: string | null = null;
    let isNewBuildRequest = false;
    let buildRequestCreatedAt: string | null = null;

    // Prefer appId if provided (new flow)
    if (appId && typeof appId === "string") {
      const { data: existingApp, error: verifyError } =
        await supabaseAdmin
          .from("buildr_apps")
          .select("id, build_request_id")
          .eq("id", appId)
          .eq("user_id", user.id)
          .single();

      if (verifyError || !existingApp) {
        return res
          .status(404)
          .json({ ok: false, error: "App not found" });
      }

      appIdToUse = appId;
      
      // If app has a build_request_id, use it; otherwise create a new one for this conversation
      if (existingApp.build_request_id) {
        // Verify the build request exists and belongs to user
        const { data: existingRequest, error: requestError } = await supabaseAdmin
          .from("buildr_build_requests")
          .select("id, created_at")
          .eq("id", existingApp.build_request_id)
          .eq("user_id", user.id)
          .single();
        
        if (!requestError && existingRequest) {
          buildRequestIdToUse = existingRequest.id;
          buildRequestCreatedAt = existingRequest.created_at;
        } else {
          // Build request doesn't exist or doesn't belong to user - create a new one
          const { data: newBuildRequest, error: insertError } = await supabaseAdmin
            .from("buildr_build_requests")
            .insert({
              user_id: user.id,
              prompt,
              status: "pending",
            })
            .select("id, created_at")
            .single();
          
          if (!insertError && newBuildRequest) {
            buildRequestIdToUse = newBuildRequest.id;
            buildRequestCreatedAt = newBuildRequest.created_at;
            isNewBuildRequest = true;
            
            // Update the app with the new build_request_id
            await supabaseAdmin
              .from("buildr_apps")
              .update({ build_request_id: newBuildRequest.id })
              .eq("id", appId);
          }
        }
      } else {
        // App has no build_request_id - create one for this conversation
        const { data: newBuildRequest, error: insertError } = await supabaseAdmin
          .from("buildr_build_requests")
          .insert({
            user_id: user.id,
            prompt,
            status: "pending",
          })
          .select("id, created_at")
          .single();
        
        if (insertError || !newBuildRequest) {
          return res.status(500).json({
            ok: false,
            error: insertError?.message ?? "Failed to create build request for app",
          });
        }
        
        buildRequestIdToUse = newBuildRequest.id;
        buildRequestCreatedAt = newBuildRequest.created_at;
        isNewBuildRequest = true;
        
        // Update the app with the new build_request_id
        await supabaseAdmin
          .from("buildr_apps")
          .update({ build_request_id: newBuildRequest.id })
          .eq("id", appId);
      }
    }
    // Legacy: support buildRequestId for backward compatibility
    else if (buildRequestId && typeof buildRequestId === "string") {
      const { data: existingRequest, error: verifyError } =
        await supabaseAdmin
          .from("buildr_build_requests")
          .select("id, created_at")
          .eq("id", buildRequestId)
          .eq("user_id", user.id)
          .single();

      if (verifyError || !existingRequest) {
        // Build request doesn't exist or doesn't belong to user - log the error but create a new one
        // eslint-disable-next-line no-console
        console.warn(
          `Build request ${buildRequestId} not found for user ${user.id}. Creating new build request.`,
          verifyError
        );
        
        // Create a new build request instead
        const { data: newBuildRequest, error: insertError } = await supabaseAdmin
          .from("buildr_build_requests")
          .insert({
            user_id: user.id,
            prompt,
            status: "pending",
          })
          .select("id, created_at")
          .single();

        if (insertError || !newBuildRequest) {
          return res.status(500).json({
            ok: false,
            error: insertError?.message ?? "Failed to create build request",
          });
        }

        buildRequestIdToUse = newBuildRequest.id;
        buildRequestCreatedAt = newBuildRequest.created_at;
        isNewBuildRequest = true;
      } else {
        // Build request exists and belongs to user
        buildRequestIdToUse = buildRequestId;
        buildRequestCreatedAt = existingRequest.created_at;
      }
    } else {
      // Neither appId nor buildRequestId provided - create a new build request
      // This is the expected flow when a user first submits a prompt (new build request)
      // appId and buildRequestId are optional - only required when adding to existing builds
      const { data: newBuildRequest, error: insertError } = await supabaseAdmin
        .from("buildr_build_requests")
        .insert({
          user_id: user.id,
          prompt,
          status: "pending",
        })
        .select("id, created_at")
        .single();

      if (insertError || !newBuildRequest) {
        return res.status(500).json({
          ok: false,
          error: insertError?.message ?? "Failed to create build request",
        });
      }

      buildRequestIdToUse = newBuildRequest.id;
      buildRequestCreatedAt = newBuildRequest.created_at;
      isNewBuildRequest = true;
    }

    // Store the chat message in the database
    const messageRole = role || "user";
    const messageData: any = {
      user_id: user.id,
      role: messageRole,
      content: prompt,
    };

    if (appIdToUse) {
      messageData.app_id = appIdToUse;
    }
    if (buildRequestIdToUse) {
      messageData.build_request_id = buildRequestIdToUse;
    }

    // Insert the chat message
    const { data: insertedMessage, error: messageError } = await supabaseAdmin
      .from("buildr_chat_messages")
      .insert(messageData)
      .select("id")
      .single();

    if (messageError) {
      // eslint-disable-next-line no-console
      console.error("Failed to store chat message:", messageError);
      return res.status(500).json({
        ok: false,
        error: `Failed to store chat message: ${messageError.message || JSON.stringify(messageError)}`,
      });
    }

    if (!insertedMessage) {
      // eslint-disable-next-line no-console
      console.error("Insert succeeded but no data returned");
      return res.status(500).json({
        ok: false,
        error: "Failed to store chat message: No data returned from insert",
      });
    }

    // Call N8N webhook for ALL chat messages (new build requests AND subsequent messages)
    // This allows AI agents to respond to user messages and continue building
    // Fetch all chat messages to send to N8N (including the one we just inserted)
    let chatMessagesQuery = supabaseAdmin
      .from("buildr_chat_messages")
      .select("id, role, content, created_at, requires_response, answered_at");

    if (appIdToUse) {
      chatMessagesQuery = chatMessagesQuery.eq("app_id", appIdToUse);
    } else if (buildRequestIdToUse) {
      chatMessagesQuery = chatMessagesQuery.eq("build_request_id", buildRequestIdToUse);
    }

    const { data: chatMessages } = await chatMessagesQuery.order("created_at", { ascending: true });

    // Always call the webhook for chat messages (both new builds and subsequent messages)
    // This allows AI agents to process every user message and respond
    // Fire-and-forget webhook call with timeout to avoid blocking the API response
    const webhookPayload = {
      appId: appIdToUse,
      buildRequestId: buildRequestIdToUse,
      userId: user.id,
      accessToken: accessToken, // Include access token so N8N can call back to Next.js APIs
      prompt, // The current message the user typed
      messages: (chatMessages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        requiresResponse: m.requires_response || false,
        answeredAt: m.answered_at || null,
      })),
      createdAt: buildRequestCreatedAt || new Date().toISOString(),
      source: "nextjs-buildr-app",
      isNew: isNewBuildRequest, // Indicate if this is a new build request or a chat message
    };

    // Choose webhook URL based on context:
    // - If appId exists: use N8N_APP_WEBHOOK_URL (app enhancement workflow)
    // - If no appId: use N8N_WEBHOOK_URL (app builder workflow)
    const webhookUrl = appIdToUse ? N8N_APP_WEBHOOK_URL : N8N_WEBHOOK_URL;
    const webhookContext = appIdToUse ? "app enhancement" : "app builder";
    
    // eslint-disable-next-line no-console
    console.log(`📤 Calling N8N ${webhookContext} webhook:`, webhookUrl);
    // eslint-disable-next-line no-console
    console.log("📦 Webhook payload:", JSON.stringify(webhookPayload, null, 2));

    // Use Promise.race to add a timeout, but don't await - fire and forget
    Promise.race([
      fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "buildr-nextjs-app/1.0",
        },
        body: JSON.stringify(webhookPayload),
        // Ensure no caching for webhook calls
        cache: "no-store",
      })
        .catch((fetchError) => {
          // eslint-disable-next-line no-console
          console.error("❌ Fetch error calling N8N webhook:", fetchError);
          // eslint-disable-next-line no-console
          if (fetchError instanceof Error) {
            // eslint-disable-next-line no-console
            console.error("Error message:", fetchError.message);
            // eslint-disable-next-line no-console
            console.error("Error stack:", fetchError.stack);
          }
          throw fetchError;
        })
        .then(async (response) => {
          // eslint-disable-next-line no-console
          console.log(
            "✅ N8N webhook response status:",
            response.status,
            response.statusText
          );

          if (!response.ok) {
            const responseText = await response.text().catch(() => "");
            // eslint-disable-next-line no-console
            console.error(
              "❌ N8N webhook returned non-OK status:",
              response.status,
              responseText.substring(0, 500)
            );
            return;
          }

          // Try to read response, but don't wait if it's slow
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            try {
              const data = await response.json();
              // eslint-disable-next-line no-console
              console.log("📥 N8N webhook success response:", data);
            } catch {
              const text = await response.text().catch(() => "");
              // eslint-disable-next-line no-console
              console.log("📥 N8N webhook response (text):", text.substring(0, 200));
            }
          } else {
            const text = await response.text().catch(() => "");
            // eslint-disable-next-line no-console
            console.log("📥 N8N webhook response (text):", text.substring(0, 200));
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("❌ Failed to notify N8N webhook:", err);
          if (err instanceof Error) {
            // eslint-disable-next-line no-console
            console.error("Error message:", err.message);
            // eslint-disable-next-line no-console
            console.error("Error stack:", err.stack);
          }
        }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Webhook timeout after 10s")), 10000)
      ),
    ]).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("⏱️ N8N webhook timeout or error (this is OK, webhook still sent):", err.message);
    });

    return res.status(200).json({
      ok: true,
      appId: appIdToUse,
      buildRequestId: buildRequestIdToUse,
      createdAt: buildRequestCreatedAt || new Date().toISOString(),
      isNew: isNewBuildRequest,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}



