import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getAppConfig, type AppConfig } from "@/lib/appConfig";
import PageRenderer from "@/components/PageRenderer";
import BuildrRunControls from "@/components/BuildrRunControls";
import ExecutionProgress from "@/components/ExecutionProgress";

type App = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export default function AppViewPage() {
  const router = useRouter();
  const { appId } = router.query;
  const [app, setApp] = useState<App | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          .select("*")
          .eq("id", appId)
          .single();

        if (fetchError) throw fetchError;

        if (!cancelled) {
          setApp(data);
          
          // Fetch app config and render it
          const config = await getAppConfig(appId);
          setAppConfig(config);
          
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to load app");
          setLoading(false);
        }
      }
    };

    void loadApp();

    return () => {
      cancelled = true;
    };
  }, [appId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading app...</div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">
          {error ?? "App not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                  className="border-b-2 border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  View
                </Link>
                <Link
                  href={`/app/${appId}/chat`}
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
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
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{app.name}</h1>
            {app.description && (
              <p className="text-gray-600 mb-4">{app.description}</p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {app.status}
                </span>
                <span className="text-sm text-gray-500">
                  Created: {new Date(app.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {/* Build Controls */}
              {typeof appId === "string" && (
                <BuildrRunControls appId={appId} />
              )}
            </div>

            {/* Execution Progress */}
            {typeof appId === "string" && (
              <div className="mt-6">
                <ExecutionProgress appId={appId} />
              </div>
            )}

            {/* App Renderer - No guessing, just render the config */}
            <div className="mt-8">
              {appConfig && appConfig.pages.length > 0 ? (
                <div className="space-y-8">
                  {appConfig.pages.map((page) => (
                    <PageRenderer
                      key={page.slug}
                      config={page}
                      appId={app?.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
                  <p className="text-gray-500">No pages configured yet</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Start chatting to build your app, or configure pages manually
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

