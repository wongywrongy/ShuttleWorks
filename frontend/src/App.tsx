import { useState } from "react";
import { useTournament } from "./hooks/useTournament";
import { SetupForm } from "./components/SetupForm";
import { DrawView } from "./components/DrawView";
import { ScheduleView } from "./components/ScheduleView";
import { LiveView } from "./components/LiveView";
import { TopBar } from "./components/TopBar";

type Tab = "draw" | "schedule" | "live";

export default function App() {
  const { data, setData, loading, error, refresh } = useTournament();
  const [tab, setTab] = useState<Tab>("draw");

  if (!data) {
    return (
      <div className="min-h-screen bg-ink-50">
        <header className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <h1 className="text-lg font-semibold tracking-tight">
              Tournament Prototype
            </h1>
            <p className="text-sm text-ink-500">
              CP-SAT scheduling engine, adapted for standard tournament formats.
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          {error ? (
            <div className="card mb-6 p-4 text-sm text-red-700 bg-red-50 border-red-200">
              {error}
            </div>
          ) : null}
          <SetupForm
            disabled={loading}
            onCreated={(t) => {
              setData(t);
              setTab("draw");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TopBar
        data={data}
        tab={tab}
        onTab={setTab}
        onReset={async () => {
          await fetch("/tournament", { method: "DELETE" });
          setData(null);
        }}
      />
      <main className="mx-auto w-full max-w-7xl px-6 py-6 flex-1">
        {error ? (
          <div className="card mb-4 p-3 text-sm text-red-700 bg-red-50 border-red-200">
            {error}
          </div>
        ) : null}
        {tab === "draw" && (
          <DrawView data={data} onChange={setData} refresh={refresh} />
        )}
        {tab === "schedule" && (
          <ScheduleView data={data} onChange={setData} refresh={refresh} />
        )}
        {tab === "live" && (
          <LiveView data={data} onChange={setData} refresh={refresh} />
        )}
      </main>
    </div>
  );
}
