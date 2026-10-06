import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { CalendarEvent } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, cn, fmtDate } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(() => iso(new Date()));

  const from = iso(month);
  const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const events = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => api.get<CalendarEvent[]>("/analytics/calendar", { query: { from, to } }),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events.data ?? []) {
      const key = e.date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events.data]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), 1 - (startOffset - i));
      out.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) out.push({ date: new Date(month.getFullYear(), month.getMonth(), day), inMonth: true });
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1]!.date;
      const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      out.push({ date: d, inMonth: false });
    }
    return out;
  }, [month]);

  const todayIso = iso(new Date());
  const dayEvents = byDate.get(selected) ?? [];

  function shift(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
    setSelected((s) => s);
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle="Deadlines and test windows at a glance." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">{monthLabel(month)}</h2>
              <div className="flex gap-1">
                <Button variant="outline" size="iconSm" title="Previous month" onClick={() => shift(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="iconSm"
                  title="Today"
                  onClick={() => {
                    const now = new Date();
                    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelected(iso(now));
                  }}
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="iconSm" title="Next month" onClick={() => shift(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {w}
                </div>
              ))}
              {cells.map(({ date, inMonth }, i) => {
                const key = iso(date);
                const evs = byDate.get(key) ?? [];
                const isSelected = key === selected;
                const isToday = key === todayIso;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={cn(
                      "relative flex min-h-12 flex-col items-center justify-start rounded-lg border p-1 text-xs transition-colors",
                      inMonth ? "border-transparent hover:border-ink-300" : "border-transparent text-ink-300 hover:border-ink-200",
                      isSelected && "border-brand-500 bg-brand-50 ring-1 ring-brand-500",
                      isToday && !isSelected && "bg-ink-100 font-bold",
                    )}
                  >
                    <span className={cn(inMonth ? "text-ink-700" : "text-ink-300", isToday && "text-brand-700")}>
                      {date.getDate()}
                    </span>
                    <span className="mt-auto flex gap-0.5">
                      {evs.slice(0, 3).map((e, x) => (
                        <span
                          key={x}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            e.type === "DEADLINE" ? "bg-danger-400" : "bg-brand-400",
                          )}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-4 text-[10px] text-ink-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand-400" /> start
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-danger-400" /> deadline
              </span>
              <span className="ml-auto">
                {byDate.size} active {byDate.size === 1 ? "day" : "days"} this month
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-ink-900">{fmtDate(selected, { weekday: "long", day: "numeric", month: "long" })}</h2>
            <div className="mt-3 space-y-2">
              {events.isLoading && <PageLoader label="Loading events…" />}
              {!events.isLoading && dayEvents.length === 0 && (
                <EmptyState title="Nothing scheduled" hint="Pick another day or month." />
              )}
              {dayEvents.map((e) => (
                <Link
                  key={e.id}
                  to={e.link || "/calendar"}
                  className={cn(
                    "block rounded-lg border p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40",
                    e.type === "DEADLINE" ? "border-danger-200 bg-danger-50/40" : "border-brand-200 bg-brand-50/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={e.type === "DEADLINE" ? "red" : "default"}>{e.type.toLowerCase()}</Badge>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[e.skill]}`}>
                      {SKILL_LABEL[e.skill]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink-900">{e.title}</p>
                  {e.detail && <p className="text-xs text-ink-500">{e.detail}</p>}
                  <p className="mt-1 text-[10px] text-ink-400">
                    {fmtDate(e.startAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} →{" "}
                    {fmtDate(e.deadlineAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {e.completed !== undefined && (e.completed ? " · done" : " · pending")}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
