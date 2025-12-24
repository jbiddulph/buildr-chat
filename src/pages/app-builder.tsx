import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabaseClient";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  appId?: string;
};

type BuildRequest = {
  id: string;
  prompt: string;
  status: string;
  created_at: string;
};

type App = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export default function AppBuilderPage() {
  const router = useRouter();
  const { buildRequestId } = router.query;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [buildRequests, setBuildRequests] = useState<BuildRequest[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [selectedBuildRequestId, setSelectedBuildRequestId] = useState<
    string | null
  >(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Basic session guard: redirect unauthenticated users to login
  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!cancelled && !user) {
        router.replace("/auth/login");
      } else if (!cancelled && user) {
        await loadBuildRequests();
        await loadApps();
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Set up Realtime subscription to listen for new messages
  // This watches the buildr_chat_messages table for new INSERT events
  // Filtered by build_request_id (user_id is handled by RLS policies)
  useEffect(() => {
    if (!selectedBuildRequestId) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log("🔌 Setting up Realtime subscription for buildRequestId:", selectedBuildRequestId);

    // Create a unique channel name for this build request
    const channelName = `chat_messages:${selectedBuildRequestId}`;
    const channel = supabase.channel(channelName);

    // Subscribe to INSERT events on buildr_chat_messages filtered by build_request_id
    // Note: user_id filtering is handled by RLS policies automatically
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "buildr_chat_messages",
          filter: `build_request_id=eq.${selectedBuildRequestId}`,
        },
        (payload) => {
          // eslint-disable-next-line no-console
          console.log("📨 Realtime INSERT event received:", payload);

          const newMessage = payload.new as {
            id: string;
            role: string;
            content: string;
            created_at: string;
            build_request_id: string;
            user_id: string;
            app_id?: string;
          };

          if (!newMessage) {
            // eslint-disable-next-line no-console
            console.warn("⚠️ Realtime payload missing new message data:", payload);
            return;
          }

          // Verify the message belongs to the correct build request
          if (newMessage.build_request_id !== selectedBuildRequestId) {
            // eslint-disable-next-line no-console
            console.warn("⚠️ Message build_request_id mismatch, ignoring:", newMessage.build_request_id);
            return;
          }

          // Note: user_id validation is handled by RLS - if we receive this event,
          // it means the current user has permission to see it

          // Add the new message to the chat (for ALL roles: user, assistant, system)
          setMessages((prev) => {
            // Check if message already exists (avoid duplicates from optimistic updates or loaded history)
            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) {
              // eslint-disable-next-line no-console
              console.log("⚠️ Message already exists, skipping:", newMessage.id);
              return prev;
            }

            // Create the message object
            const chatMessage: ChatMessage = {
              id: newMessage.id,
              role: newMessage.role as "user" | "assistant" | "system",
              content: newMessage.content,
              createdAt: newMessage.created_at,
              appId: (newMessage as any).app_id || undefined,
            };

            // Insert the message in the correct position (sorted by created_at)
            const updatedMessages = [...prev, chatMessage].sort((a, b) => {
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });

            // eslint-disable-next-line no-console
            console.log("✅ Added new message via Realtime:", {
              id: chatMessage.id,
              role: chatMessage.role,
              contentPreview: chatMessage.content.substring(0, 50),
            });

            return updatedMessages;
          });

          // Stop the loading animation when we receive an assistant/system response
          if (newMessage.role === "assistant" || newMessage.role === "system") {
            setIsWaitingForResponse(false);
          }
        }
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.log("📡 Realtime subscription status:", status, "for buildRequestId:", selectedBuildRequestId);
        if (status === "SUBSCRIBED") {
          // eslint-disable-next-line no-console
          console.log("✅ Successfully subscribed to realtime updates for buildRequestId:", selectedBuildRequestId);
        } else if (status === "CHANNEL_ERROR") {
          // eslint-disable-next-line no-console
          console.error("❌ Realtime subscription error for buildRequestId:", selectedBuildRequestId);
        } else if (status === "TIMED_OUT") {
          // eslint-disable-next-line no-console
          console.warn("⏱️ Realtime subscription timed out for buildRequestId:", selectedBuildRequestId);
        } else if (status === "CLOSED") {
          // eslint-disable-next-line no-console
          console.log("🔒 Realtime subscription closed for buildRequestId:", selectedBuildRequestId);
        }
      });

    // Cleanup: unsubscribe when component unmounts or buildRequestId changes
    return () => {
      // eslint-disable-next-line no-console
      console.log("🧹 Cleaning up Realtime subscription for buildRequestId:", selectedBuildRequestId);
      void supabase.removeChannel(channel);
    };
  }, [selectedBuildRequestId]);

  // Load apps from API
  const loadApps = async () => {
    try {
      setLoadingApps(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        // eslint-disable-next-line no-console
        console.warn("No session access token, cannot load apps");
        return;
      }

      const response = await fetch(
        `/api/apps?accessToken=${encodeURIComponent(session.access_token)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const json = (await response.json()) as {
        ok: boolean;
        apps?: App[];
        error?: string;
      };

      // eslint-disable-next-line no-console
      console.log("Load apps response:", { response: response.ok, status: response.status, json });

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error("HTTP error loading apps:", response.status, json.error || "Unknown error");
        return;
      }

      if (json.ok) {
        // Always set apps, even if empty array
        const appsList = json.apps || [];
        // eslint-disable-next-line no-console
        console.log(`Loaded ${appsList.length} apps:`, appsList);
        setApps(appsList);
      } else {
        // eslint-disable-next-line no-console
        console.error("API error loading apps:", json.error || "Unknown error");
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load apps:", err);
    } finally {
      setLoadingApps(false);
    }
  };

  // Load build requests from Supabase
  const loadBuildRequests = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("buildr_build_requests")
        .select("id, prompt, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Failed to load build requests:", fetchError);
        return;
      }

      setBuildRequests(data || []);

      // If URL has buildRequestId, select it and load chat history
      if (buildRequestId && typeof buildRequestId === "string") {
        setSelectedBuildRequestId(buildRequestId);
        await loadChatHistory(buildRequestId);
      } else {
        // If no build request selected, show empty chat with system message
        setSelectedBuildRequestId(null);
        setMessages([
          {
            id: "system-1",
            role: "system",
            content:
              "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Error loading build requests:", err);
    }
  };

  // Load chat history for a build request
  const loadChatHistory = async (id: string | null | undefined): Promise<ChatMessage[] | null> => {
    if (!id) {
      setMessages([
        {
          id: "system-1",
          role: "system",
          content:
            "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
          createdAt: new Date().toISOString(),
        },
      ]);
      return null;
    }

    setLoadingMessages(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("You must be signed in to view chat history.");
        return null;
      }

      const response = await fetch(
        `/api/chat-message?buildRequestId=${encodeURIComponent(id)}&accessToken=${encodeURIComponent(session.access_token)}`
      );

      const json = (await response.json()) as {
        ok: boolean;
        messages?: ChatMessage[];
        error?: string;
      };

      if (!response.ok || !json.ok) {
        // If it's a 404 or no messages, show system message instead of error
        if (response.status === 404 || json.error?.includes("not found")) {
          const systemMsg: ChatMessage = {
            id: "system-1",
            role: "system",
            content:
              "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
            createdAt: new Date().toISOString(),
          };
          setMessages([systemMsg]);
          setError(null);
          return [systemMsg];
        }
        setError(json.error ?? "Failed to load chat history");
        return null;
      }

      // If no messages exist, show system message
      if (!json.messages || json.messages.length === 0) {
        const systemMsg: ChatMessage = {
          id: "system-1",
          role: "system",
          content:
            "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
          createdAt: new Date().toISOString(),
        };
        setMessages([systemMsg]);
        setError(null);
        return [systemMsg];
      } else {
        // Replace messages with loaded ones
        // The realtime subscription will handle new messages that come in after this
        // This prevents duplicates from optimistic messages or previous loads
        setMessages(json.messages);
        setError(null);
        // Check if there are any assistant/system messages - if so, stop waiting for response
        const hasAssistantMessage = json.messages.some((m) => m.role === "assistant" || m.role === "system");
        if (hasAssistantMessage) {
          setIsWaitingForResponse(false);
        }
        return json.messages;
      }
    } catch (err: any) {
      // On error, show system message instead of blocking
      const systemMsg: ChatMessage = {
        id: "system-1",
        role: "system",
        content:
          "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
        createdAt: new Date().toISOString(),
      };
      setMessages([systemMsg]);
      // eslint-disable-next-line no-console
      console.error("Failed to load chat history:", err);
      return [systemMsg];
    } finally {
      setLoadingMessages(false);
    }
    return null;
  };

  // Handle selecting a build request
  const handleSelectBuildRequest = async (id: string) => {
    setSelectedBuildRequestId(id);
    router.replace(`/app-builder?buildRequestId=${id}`, undefined, {
      shallow: true,
    });
    await loadChatHistory(id);
  };

  // Handle clicking the "+ New Build" button
  const handleNewBuildRequest = () => {
    setSelectedBuildRequestId(null);
    setMessages([
      {
        id: "system-1",
        role: "system",
        content:
          "Describe the product you want and how you'd like it built. I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.",
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    router.replace("/app-builder", undefined, { shallow: true });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await router.push("/auth/login");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!input.trim()) return;

    setLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setError("You must be signed in to submit a build request.");
        await router.push("/auth/login");
        return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: input,
        createdAt: new Date().toISOString(),
      };

      // Optimistically add user message
      setMessages((prev) => [...prev, userMessage]);
      
      // Start showing loading indicator
      setIsWaitingForResponse(true);

      const response = await fetch("/api/build-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input,
          accessToken: session.access_token,
          buildRequestId: selectedBuildRequestId || undefined,
          role: "user",
        }),
      });

      // Check if response has content before parsing JSON
      const responseText = await response.text();
      let json: {
        ok: boolean;
        buildRequestId?: string;
        isNew?: boolean;
        error?: string;
      };
      
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from server. Check API logs.");
      }
      
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse JSON:", responseText);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed to send message");
        // Remove the optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setIsWaitingForResponse(false);
        return;
      }

      // If this was a new build request, reload the list and select it
      if (json.isNew && json.buildRequestId) {
        // Set the selected build request ID first (this will trigger the Realtime subscription)
        setSelectedBuildRequestId(json.buildRequestId);
        router.replace(
          `/app-builder?buildRequestId=${json.buildRequestId}`,
          undefined,
          { shallow: true }
        );
        await loadBuildRequests();
        
        // Load chat history immediately - the subscription useEffect will set up in parallel
        // If the subscription isn't ready yet, loadChatHistory will show existing messages
        // and the subscription will catch any new messages that come in after it's ready
        await loadChatHistory(json.buildRequestId);
      } else if (json.buildRequestId) {
        // For existing build requests, reload messages immediately
        // The subscription is already active for existing build requests
        await loadChatHistory(json.buildRequestId);
      }

      setInput("");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-sm font-semibold text-white">
            b
          </div>
          <div>
            <p className="text-sm font-semibold">buildr</p>
            <p className="text-xs text-slate-400">
              AI agents that build full-stack apps from a prompt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Apps Dropdown */}
          <select
            onChange={(e) => {
              const appId = e.target.value;
              if (appId) {
                router.push(`/app/${appId}`);
              }
            }}
            defaultValue=""
            disabled={loadingApps || apps.length === 0}
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 outline-none hover:border-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {loadingApps
                ? "Loading apps..."
                : apps.length === 0
                  ? "No apps yet"
                  : "Select an app..."}
            </option>
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex flex-1 justify-center px-4 py-6">
        <div className="flex w-full max-w-6xl flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">buildr chat</h1>
            <p className="mt-1 text-sm text-slate-400">
              Chat with your build agents. The orchestrator, planner, frontend,
              backend, UI/UX, and deployment agents will use this conversation
              to decide what to build.
            </p>
          </div>

          {/* Build Requests Tiles */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleNewBuildRequest}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                selectedBuildRequestId === null
                  ? "border-sky-500 bg-sky-500/20 text-sky-400"
                  : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
              }`}
            >
              + New Build
            </button>
            {buildRequests.map((br) => (
              <button
                key={br.id}
                onClick={() => handleSelectBuildRequest(br.id)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  selectedBuildRequestId === br.id
                    ? "border-sky-500 bg-sky-500/20 text-sky-400"
                    : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[200px]">{br.prompt}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      br.status === "pending"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : br.status === "deployed"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {br.status}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Chat Interface - always shown */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            {loadingMessages ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-slate-400">Loading chat...</p>
              </div>
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      <p className="text-slate-400 mb-4">
                        Describe the product you want and how you'd like it built.
                      </p>
                      <p className="text-sm text-slate-500">
                        I'll coordinate the orchestrator, planner, frontend, backend, UI/UX, and deployment agents for you.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.role === "user"
                            ? "justify-end"
                            : m.role === "assistant"
                              ? "justify-start"
                              : "justify-center"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            m.role === "user"
                              ? "bg-sky-500 text-white"
                              : m.role === "assistant"
                                ? "bg-slate-800 text-slate-50"
                                : "bg-slate-900 text-slate-400 text-xs"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{m.content}</div>
                          {m.appId && m.role === "assistant" && (
                            <div className="mt-2 pt-2 border-t border-slate-700">
                              <a
                                href={`/app/${m.appId}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 underline"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                                View App
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isWaitingForResponse && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-50">
                          <div className="flex items-center gap-1">
                            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
                              .
                            </span>
                            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                              .
                            </span>
                            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                              .
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="border-t border-slate-800 bg-slate-900/80 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="max-h-40 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  placeholder={
                    selectedBuildRequestId === null
                      ? "Describe your application idea..."
                      : "Continue chatting with the AI agents..."
                  }
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs text-rose-400" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
