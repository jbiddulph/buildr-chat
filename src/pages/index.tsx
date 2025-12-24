export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <main className="w-full max-w-2xl rounded-2xl bg-slate-900/60 p-8 shadow-xl ring-1 ring-slate-800">
        <h1 className="text-3xl font-semibold text-white">buildr</h1>
        <p className="mt-3 text-sm text-slate-400">
          Describe the product you want, and a team of AI agents plans, codes,
          and deploys a full-stack Next.js app to GitHub and Vercel.
        </p>

        <div className="mt-8 flex flex-col gap-3 text-sm text-slate-300">
          <p className="font-medium text-slate-200">Pipeline agents</p>
          <ul className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <li>Orchestrator Agent</li>
            <li>Planner Agent</li>
            <li>Frontend Agent</li>
            <li>Backend Agent</li>
            <li>File Generator Agent</li>
            <li>UI/UX Agent</li>
            <li>Deployment Agent</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
          >
            Get started
          </a>
          <a
            href="/app-builder"
            className="text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            Skip to builder
          </a>
        </div>
      </main>
    </div>
  );
}
