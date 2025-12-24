import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ExecutionStep = {
  id: string;
  app_id: string;
  step_index: number;
  type: string; // Column name is "type", not "step_type"
  target: string | null;
  status: "pending" | "processing" | "applied" | "failed";
  created_at: string;
  updated_at: string;
  operation_id?: string | null;
};

type ExecutionProgressProps = {
  appId: string;
};

export default function ExecutionProgress({ appId }: ExecutionProgressProps) {
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSteps = async () => {
    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("buildr_execution_steps")
        .select("*")
        .eq("app_id", appId)
        .order("step_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      setSteps((data || []) as ExecutionStep[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load execution steps");
      console.error("Error loading execution steps:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!appId) return;

    loadSteps();

    // Set up realtime subscription for updates
    const channel = supabase
      .channel(`execution_steps:${appId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buildr_execution_steps",
          filter: `app_id=eq.${appId}`,
        },
        () => {
          // Reload steps when changes occur
          loadSteps();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appId]);

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">Loading execution steps...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">No execution steps yet</p>
      </div>
    );
  }

  const getStatusColor = (status: ExecutionStep["status"]) => {
    switch (status) {
      case "pending":
        return "bg-gray-100 text-gray-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "applied":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStepType = (stepType: string | null | undefined) => {
    if (!stepType) return "Unknown";
    return stepType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Execution Progress
      </h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{steps.length}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {steps.filter((s) => s.status === "pending").length}
          </div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {steps.filter((s) => s.status === "applied").length}
          </div>
          <div className="text-xs text-gray-500">Applied</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">
            {steps.filter((s) => s.status === "failed").length}
          </div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              step.status === "pending"
                ? "bg-gray-50 border-gray-200"
                : step.status === "processing"
                  ? "bg-blue-50 border-blue-200"
                  : step.status === "applied"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
                {step.step_index + 1}
              </div>
              <div>
                <div className="font-medium text-gray-900">
                  {formatStepType(step.type)}
                </div>
                {step.target && (
                  <div className="text-sm text-gray-600">{step.target}</div>
                )}
              </div>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                  step.status
                )}`}
              >
                {step.status === "processing" && (
                  <span className="animate-spin mr-1">⟳</span>
                )}
                {step.status === "applied" && <span className="mr-1">✓</span>}
                {step.status === "failed" && <span className="mr-1">✗</span>}
                {step.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

