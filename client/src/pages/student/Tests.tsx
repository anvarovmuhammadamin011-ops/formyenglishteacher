import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Play, RotateCcw, Timer } from "lucide-react";
import { api } from "@/lib/api";
import type { AssignedRow, AttemptView } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  Tabs,
} from "@/components/ui";
import { LEVEL_LABEL, SKILL_ACCENT, SKILL_LABEL, errorMessage, fmtCountdown, fmtDateTime } from "@/lib/utils";

const STATE_TABS = [
  { value: "all", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "MISSED", label: "Missed" },
];

function stateBadge(state: AssignedRow["state"]) {
  switch (state) {
    case "AVAILABLE":
      return <Badge tone="green">Ready</Badge>;
    case "IN_PROGRESS":
      return <Badge tone="amber">In progress</Badge>;
    case "COMPLETED":
      return <Badge tone="indigo">Completed</Badge>;
    case "SCHEDULED":
      return <Badge tone="sky">Scheduled</Badge>;
    case "MISSED":
      return <Badge tone="red">Missed</Badge>;
    default:
      return <Badge tone="gray">{state}</Badge>;
  }
}

export default function StudentTestsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["attempts", "assigned"],
    queryFn: () => api.get<AssignedRow[]>("/attempts/assigned"),
    refetchInterval: 60_000,
  });

  const startTest = useMutation({
    mutationFn: (assignmentId: string) => api.post<AttemptView>("/attempts/start", { assignmentId }),
    onSuccess: (attempt) => {
      qc.invalidateQueries({ queryKey: ["attempts", "assigned"] });
      navigate(`/attempts/${attempt.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = useMemo(() => data ?? [], [data]);
  const filtered = tab === "all" ? rows : rows.filter((r) => r.state === tab);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [rows]);

  if (isLoading) return <PageLoader label="Loading your tests…" />;

  return (
    <>
      <PageHeader title="My tests" subtitle="Tests assigned to your groups." />

      <Tabs
        tabs={STATE_TABS.map((t) => ({
          ...t,
          badge: t.value === "all" ? rows.length : counts[t.value] ?? 0,
        }))}
        value={tab}
        onChange={setTab}
      />

      {filtered.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Nothing here" hint="There are no tests in this category right now." />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {filtered.map((row) => {
            const t = row.test;
            const started = row.state === "IN_PROGRESS" && row.activeAttempt;
            const resumeTo = row.activeAttempt?.id;
            return (
              <Card key={row.assignmentId} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[t.skill]}`}>
                        {SKILL_LABEL[t.skill]}
                      </span>
                      <Badge tone="gray">{LEVEL_LABEL[t.difficulty]}</Badge>
                      {stateBadge(row.state)}
                    </div>
                    <h3 className="mt-2 truncate text-sm font-semibold text-ink-900">{t.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-500">{row.group.name}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-ink-50 p-2.5 text-center">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-400">Questions</dt>
                    <dd className="text-sm font-semibold text-ink-800">{t.questionCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-400">Duration</dt>
                    <dd className="text-sm font-semibold text-ink-800">{fmtCountdown(row.durationSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-ink-400">Pass mark</dt>
                    <dd className="text-sm font-semibold text-ink-800">{t.passingScore}%</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> {fmtDateTime(row.startAt)} → {fmtDateTime(row.deadlineAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {row.attemptsUsed}/{row.maxAttempts} attempts used
                  </span>
                </div>

                {row.bestResult && (
                  <p className="mt-2 text-xs">
                    Best score:{" "}
                    <Link to={`/results/${row.bestResult.id}`} className="font-semibold text-brand-600 hover:underline">
                      {row.bestResult.percentage}%
                    </Link>{" "}
                    ({row.bestResult.score}/{row.bestResult.totalPoints})
                  </p>
                )}

                <div className="mt-auto flex gap-2 pt-3">
                  {started && resumeTo ? (
                    <Button className="flex-1" size="sm" onClick={() => navigate(`/attempts/${resumeTo}`)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Resume test
                    </Button>
                  ) : row.state === "AVAILABLE" ? (
                    <Button
                      className="flex-1"
                      size="sm"
                      disabled={startTest.isPending}
                      onClick={() => startTest.mutate(row.assignmentId)}
                    >
                      <Play className="h-3.5 w-3.5" /> {row.attemptsUsed > 0 ? "Retry test" : "Start test"}
                    </Button>
                  ) : row.state === "COMPLETED" && row.bestResult ? (
                    <Button className="flex-1" size="sm" variant="outline" onClick={() => navigate(`/results/${row.bestResult!.id}`)}>
                      View result
                    </Button>
                  ) : (
                    <Button className="flex-1" size="sm" variant="outline" disabled>
                      {row.state === "SCHEDULED" ? "Not open yet" : row.state === "MISSED" ? "Deadline passed" : "Unavailable"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
