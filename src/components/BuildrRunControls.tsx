import { useState } from "react";

type BuildrRunControlsProps = {
  appId: string;
};

export default function BuildrRunControls({ appId }: BuildrRunControlsProps) {
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  const runStep = async () => {
    if (running) return;

    setRunning(true);
    try {
      const response = await fetch("/api/buildr/run-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ app_id: appId }),
      });

      const data = await response.json();
      
      if (!response.ok || data.status === "error") {
        const errorMessage = data.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error("Step execution error:", errorMessage);
        alert(`Error: ${errorMessage}`);
        return;
      }
      
      console.log("Step executed:", data);
      
      if (data.status === "done") {
        console.log("All steps completed");
      }
    } catch (error: any) {
      console.error("Error running step:", error);
      alert(`Error: ${error?.message || "Unknown error occurred"}`);
    } finally {
      setRunning(false);
    }
  };

  const runAllSteps = async () => {
    if (running) return;

    setRunning(true);
    setRunningAll(true);

    try {
      while (true) {
        const response = await fetch("/api/buildr/run-step", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ app_id: appId }),
        });

        const res = await response.json();

        if (!response.ok || res.status === "error") {
          const errorMessage = res.error || `HTTP ${response.status}: ${response.statusText}`;
          console.error("Step execution error:", errorMessage);
          alert(`Error: ${errorMessage}`);
          break;
        }

        if (res.status === "done") {
          console.log("All steps completed");
          break;
        }

        // Small delay between steps to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.error("Error running steps:", error);
      alert(`Error: ${error?.message || "Unknown error occurred"}`);
    } finally {
      setRunning(false);
      setRunningAll(false);
    }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={runStep}
        disabled={running}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running && !runningAll ? "Running..." : "Run Build"}
      </button>

      <button
        onClick={runAllSteps}
        disabled={running}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {runningAll ? "Running All Steps..." : "Run All Steps"}
      </button>
    </div>
  );
}

