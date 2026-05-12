import { useEffect, useState } from "react";
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
  const [eventId, setEventId] = useState<string>("");

  // Keep selected event valid as data changes.
  useEffect(() => {
    if (!data || data.events.length === 0) {
      setEventId("");
      return;
    }
    if (!data.events.find((e) => e.id === eventId)) {
      setEventId(data.events[0].id);
    }
  }, [data, eventId]);

  if (!data) {
    return (
      <div className="min-h-screen bg-ink-50">
        <header className="border-b border-ink-200 bg-bg-elev">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <h1 className="text-lg font-semibold tracking-tight">
              Tournament Prototype
            </h1>
            <p className="text-sm text-ink-500">
              CP-SAT scheduling engine with BWF draw methodology + multi-event.
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-8">
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
              if (t.events[0]) setEventId(t.events[0].id);
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
        eventId={eventId}
        onEventId={setEventId}
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
          <DrawView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {tab === "schedule" && (
          <ScheduleView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
        {tab === "live" && (
          <LiveView
            data={data}
            eventId={eventId}
            onChange={setData}
            refresh={refresh}
          />
        )}
      </main>
    </div>
  );
}
