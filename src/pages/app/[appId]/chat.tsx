import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getAppConfig, type AppConfig } from "@/lib/appConfig";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

type App = {
  id: string;
  name: string;
};

export default function AppChatPage() {
  const router = useRouter();
  const { appId } = router.query;
  const [app, setApp] = useState<App | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadApp = async () => {
      if (!appId || typeof appId !== "string") return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/auth/login");
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("buildr_apps")
          .select("id, name")
          .eq("id", appId)
          .single();

        if (fetchError) throw fetchError;

        if (!cancelled) {
          setApp(data);
          await loadChatHistory(appId);
          // Load app config to generate suggestions
          const config = await getAppConfig(appId);
          if (config) {
            setAppConfig(config);
            generateSuggestedPrompts(config);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to load app");
        }
      }
    };

    void loadApp();

    return () => {
      cancelled = true;
    };
  }, [appId, router]);

  // Generate suggested prompts based on app structure
  const generateSuggestedPrompts = (config: AppConfig) => {
    const suggestions: string[] = [];
    const modelNames = Object.keys(config.dataModels || {});
    const pages = config.pages || [];
    
    // For each model, suggest adding CRUD components
    modelNames.forEach((modelName) => {
      const model = config.dataModels[modelName];
      const page = pages.find((p) => p.slug.toLowerCase().includes(modelName.toLowerCase()));
      
      if (page) {
        // Check if page has components
        const hasComponents = page.components && page.components.length > 0;
        
        if (!hasComponents) {
          suggestions.push(`Add CRUD forms and data table to the ${page.title || modelName} page`);
          suggestions.push(`Create a data table to list all ${modelName} records with search and filters`);
          suggestions.push(`Add a form to create and edit ${modelName} records on the ${page.title || modelName} page`);
        } else {
          suggestions.push(`Enhance the ${page.title || modelName} page with advanced filtering and sorting`);
        }
      }
    });
    
    // General suggestions
    if (pages.length > 0) {
      suggestions.push("Add navigation menu to connect all pages");
      suggestions.push("Add form validation and error handling to all forms");
      suggestions.push("Add data export functionality (CSV, PDF)");
    }
    
    // If we have models but suggestions are empty, add generic ones
    if (modelNames.length > 0 && suggestions.length === 0) {
      suggestions.push(`Add CRUD components for ${modelNames.join(", ")}`);
      suggestions.push("Create data tables with search, filter, and pagination");
      suggestions.push("Add forms with validation for creating and editing records");
    }
    
    setSuggestedPrompts(suggestions.slice(0, 6)); // Limit to 6 suggestions
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const loadChatHistory = async (appIdParam: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch(
        `/api/chat-message?appId=${appIdParam}&accessToken=${session.access_token}`
      );

      const json = (await response.json()) as {
        ok: boolean;
        messages?: ChatMessage[];
        error?: string;
      };

      if (json.ok && json.messages) {
        setMessages(json.messages);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load chat history:", err);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!input.trim() || !appId || typeof appId !== "string") return;

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("You must be signed in to send messages.");
        return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: input,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      const response = await fetch("/api/build-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input,
          accessToken: session.access_token,
          appId: appId,
          role: "user",
        }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        return;
      }

      // Reload messages to get the stored version
      await loadChatHistory(appId);
      setInput("");
    } catch (err: any) {
      setError(err.message ?? "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link href="/app-builder" className="text-gray-600 hover:text-gray-900">
                  ← Back to Apps
                </Link>
              </div>
              <div className="ml-10 flex space-x-8">
                <Link
                  href={`/app/${appId}`}
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  View
                </Link>
                <Link
                  href={`/app/${appId}/chat`}
                  className="border-b-2 border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Chat
                </Link>
                <Link
                  href={`/app/${appId}/pages`}
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Pages
                </Link>
                <Link
                  href={`/app/${appId}/data`}
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Data
                </Link>
                <Link
                  href={`/app/${appId}/settings`}
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Settings
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700">{app.name}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Suggested Prompts */}
      {messages.length === 0 && suggestedPrompts.length > 0 && (
        <div className="bg-gray-50 border-b border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Suggested prompts for your app:
            </h3>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            {suggestedPrompts.length > 0 
              ? "Select a suggestion above or type your own message to continue building your app."
              : "Start a conversation about your app."}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-2xl rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900 border border-gray-200"
                }`}
              >
                <div className="text-sm font-medium mb-1">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-xs mt-1 ${
                    message.role === "user" ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {new Date(message.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        {error && (
          <div className="mb-2 text-red-600 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

