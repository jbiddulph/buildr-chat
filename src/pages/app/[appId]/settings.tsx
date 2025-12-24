import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type App = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  github_repo_url: string | null;
  vercel_deployment_url: string | null;
  created_at: string;
  updated_at: string;
};

export default function AppSettingsPage() {
  const router = useRouter();
  const { appId } = router.query;
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
          setName(data.name);
          setDescription(data.description || "");
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (!appId || typeof appId !== "string") return;

    try {
      const { error: updateError } = await supabase
        .from("buildr_apps")
        .update({
          name,
          description: description || null,
        })
        .eq("id", appId);

      if (updateError) throw updateError;

      // Reload app data
      const { data, error: fetchError } = await supabase
        .from("buildr_apps")
        .select("*")
        .eq("id", appId)
        .single();

      if (fetchError) throw fetchError;

      setApp(data);
      alert("Settings saved successfully!");
    } catch (err: any) {
      setError(err.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading settings...</div>
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
                  className="border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 text-sm font-medium"
                >
                  Data
                </Link>
                <Link
                  href={`/app/${appId}/settings`}
                  className="border-b-2 border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 text-sm font-medium"
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
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your app settings and information
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  App Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">App Information</h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {app.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">App ID</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{app.id}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Created</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {new Date(app.created_at).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {new Date(app.updated_at).toLocaleString()}
                    </dd>
                  </div>
                  {app.github_repo_url && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">GitHub Repository</dt>
                      <dd className="mt-1 text-sm text-blue-600">
                        <a href={app.github_repo_url} target="_blank" rel="noopener noreferrer">
                          {app.github_repo_url}
                        </a>
                      </dd>
                    </div>
                  )}
                  {app.vercel_deployment_url && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Vercel Deployment</dt>
                      <dd className="mt-1 text-sm text-blue-600">
                        <a href={app.vercel_deployment_url} target="_blank" rel="noopener noreferrer">
                          {app.vercel_deployment_url}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

