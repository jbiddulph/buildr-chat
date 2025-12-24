import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type App = {
  id: string;
  name: string;
};

type DataModel = {
  id: string;
  config_key: string;
  config_value: any;
  updated_at: string;
};

export default function AppDataPage() {
  const router = useRouter();
  const { appId } = router.query;
  const [app, setApp] = useState<App | null>(null);
  const [dataModels, setDataModels] = useState<DataModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!appId || typeof appId !== "string") return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/auth/login");
        return;
      }

      try {
        const { data: appData, error: appError } = await supabase
          .from("buildr_apps")
          .select("id, name")
          .eq("id", appId)
          .single();

        if (appError) throw appError;

        const { data: modelsData, error: modelsError } = await supabase
          .from("buildr_app_spec")
          .select("*")
          .eq("app_id", appId)
          .eq("config_type", "architecture")
          .order("updated_at", { ascending: false });

        if (modelsError) throw modelsError;

        if (!cancelled) {
          setApp(appData);
          setDataModels(modelsData || []);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to load data models");
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [appId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading data models...</div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error ?? "App not found"}</div>
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
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
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
                  className="border-b-2 border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 text-sm font-medium"
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
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">Data Models</h1>
              <p className="mt-1 text-sm text-gray-500">
                View and manage your app data models and schema
              </p>
            </div>

            <div className="p-6">
              {dataModels.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No data models configured yet</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Data models will appear here once your app schema is defined
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dataModels.map((model) => (
                    <div
                      key={model.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {model.config_key}
                      </h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Updated: {new Date(model.updated_at).toLocaleString()}
                      </p>
                      <div className="bg-gray-50 rounded p-4 overflow-auto">
                        <pre className="text-sm">
                          {JSON.stringify(model.config_value, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

