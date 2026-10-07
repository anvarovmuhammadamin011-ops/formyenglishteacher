import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv, stamp } from "@/lib/export";
import type { TestResultsReport } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageLoader,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
} from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, cn, fmtDateTime, fmtDuration, scoreTone } from "@/lib/utils";

export default function TestResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState("attempts");
  const [groupId, setGroupId] = useState("");

  const results = useQuery({
    queryKey: ["test-results", id, groupId],
    queryFn: () => api.get<TestResultsReport>(`/tests/${id}/results`, { query: { groupId } }),
    enabled: Boolean(id),
  });

  const groups = useQuery({
    queryKey: ["group-options"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/groups/options"),
  });

  if (results.isLoading) return <PageLoader label="Loading results…" />;
  if (!results.data) return <EmptyState title="Results not found" />;

  const { test, summary, attempts, questionAnalysis, assignments } = results.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/tests" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
          <ArrowLeft className="h-3 w-3" /> All tests
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-44">
            <option value="">All groups</option>
            {(groups.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `results_${test.title}_${stamp()}`,
                ["Student", "Username", "Group", "Score", "Total", "Percent", "Duration (s)", "Started", "Submitted", "Status", "Tab switches", "Refreshes"],
                attempts.map((a) => [
                  `${a.student.firstName} ${a.student.lastName}`,
                  a.student.username,
                  a.group?.name ?? "",
                  a.score,
                  a.totalPoints,
                  a.percentage,
                  a.durationSeconds ?? "",
                  a.startedAt,
                  a.submittedAt ?? "",
                  a.status,
                  a.tabSwitches,
                  a.refreshCount,
                ]),
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-ink-900">{test.title}</h1>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[test.skill]}`}>
          {SKILL_LABEL[test.skill]}
        </span>
        <Badge tone="gray">pass {test.passingScore}%</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Assigned" value={summary.assignedStudents} />
        <StatCard label="Completed" value={summary.completed} tone="green" />
        <StatCard label="In progress" value={summary.inProgress} tone="amber" />
        <StatCard label="Not started" value={summary.notStarted} tone="ink" />
        <StatCard label="Average" value={`${summary.average}%`} tone="brand" />
        <StatCard label="Pass rate" value={`${summary.passRate}%`} tone={summary.passRate >= 60 ? "green" : "red"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Score range</CardTitle>
            <Badge tone="gray">
              high {summary.highest}% · low {summary.lowest}% · avg {fmtDuration(summary.averageDurationSeconds)}
            </Badge>
          </CardHeader>
          <CardContent>
            {attempts.length === 0 ? (
              <p className="text-sm text-ink-500">No attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {attempts.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <Avatar src={a.student.avatarUrl} firstName={a.student.firstName} lastName={a.student.lastName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-ink-800">
                          {a.student.firstName} {a.student.lastName}
                          {a.group && <span className="ml-1.5 text-ink-400">({a.group.name})</span>}
                        </span>
                        <span className={cn("font-bold", scoreTone(a.percentage))}>{a.percentage}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
                        <div
                          className={cn("h-full rounded-full", a.percentage >= test.passingScore ? "bg-success-500" : "bg-danger-400")}
                          style={{ width: `${a.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {assignments.length === 0 && <p className="text-xs text-ink-500">Not assigned yet.</p>}
            {assignments.map((a) => (
              <div key={a.id} className="rounded-lg border border-ink-200 p-2.5 text-xs">
                <p className="font-semibold text-ink-800">{a.group.name}</p>
                <p className="mt-0.5 text-ink-500">
                  {fmtDateTime(a.startAt)} → {fmtDateTime(a.deadlineAt)}
                </p>
                <p className="text-ink-400">
                  {a.durationSeconds ? fmtDuration(a.durationSeconds) : "—"} · {a.status.toLowerCase()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5">
        <Tabs
          tabs={[
            { value: "attempts", label: "Attempts", badge: attempts.length },
            { value: "questions", label: "Question analysis", badge: questionAnalysis.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "attempts" ? (
        <Card className="mt-4">
          <CardContent className="p-0">
            {attempts.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No attempts yet" hint="Results appear as students submit the test." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Student</TH>
                    <TH>Group</TH>
                    <TH>Score</TH>
                    <TH>Result</TH>
                    <TH>Duration</TH>
                    <TH>Submitted</TH>
                    <TH>Cheating flags</TH>
                  </TR>
                </THead>
                <TBody>
                  {attempts.map((a) => (
                    <TR key={a.id}>
                      <TD>
                        <Link to={`/students/${a.student.id}`} className="flex items-center gap-2 font-medium text-ink-900 hover:text-brand-600">
                          <Avatar src={a.student.avatarUrl} firstName={a.student.firstName} lastName={a.student.lastName} />
                          {a.student.firstName} {a.student.lastName}
                        </Link>
                      </TD>
                      <TD className="text-xs">{a.group?.name ?? "—"}</TD>
                      <TD>
                        <span className={cn("font-bold", scoreTone(a.percentage))}>
                          {a.percentage}% <span className="font-normal text-ink-400">({a.score}/{a.totalPoints})</span>
                        </span>
                      </TD>
                      <TD>
                        {a.percentage >= test.passingScore ? <Badge tone="green">Passed</Badge> : <Badge tone="red">Failed</Badge>}
                      </TD>
                      <TD className="text-xs">{fmtDuration(a.durationSeconds)}</TD>
                      <TD className="text-xs">{fmtDateTime(a.submittedAt)}</TD>
                      <TD className="text-xs">
                        {a.tabSwitches > 0 || a.refreshCount > 0 ? (
                          <span className="text-warning-600">
                            {a.tabSwitches} tabs · {a.refreshCount} refresh
                          </span>
                        ) : (
                          <span className="text-ink-400">clean</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-3 p-4">
              {questionAnalysis.length === 0 && <p className="text-sm text-ink-500">No questions.</p>}
              {questionAnalysis.map((q, i) => (
                <div key={q.id} className={cn("rounded-lg border p-3", q.correctPct >= 70 ? "border-emerald-200 bg-emerald-50/40" : q.correctPct >= 40 ? "border-amber-200 bg-amber-50/40" : "border-red-200 bg-red-50/40")}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink-900">
                      <span className="mr-1.5 text-ink-400">{i + 1}.</span>
                      {q.text}
                    </p>
                    <span className={cn("shrink-0 text-sm font-bold", scoreTone(q.correctPct))}>{q.correctPct}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-ink-400">
                    {q.type.replace("_", " ").toLowerCase()} · {q.correctCount}/{q.attemptCount} correct ·{" "}
                    {q.answeredCount} answered
                  </p>
                  {q.options.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((o) => (
                        <div key={o.id} className="flex items-center gap-2 text-xs">
                          <span className={cn("truncate", o.isCorrect ? "font-semibold text-success-600" : "text-ink-500")}>
                            {o.text}
                          </span>
                          <span className="ml-auto shrink-0 text-ink-400">{o.chosenCount} picks</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Hardest questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[...questionAnalysis]
                .sort((a, b) => a.correctPct - b.correctPct)
                .slice(0, 5)
                .map((q, i) => (
                  <div key={q.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-ink-700">
                        {i + 1}. {q.text}
                      </span>
                      <span className={cn("ml-2 shrink-0 font-bold", scoreTone(q.correctPct))}>{q.correctPct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
                      <div
                        className={cn("h-full rounded-full", q.correctPct >= 70 ? "bg-success-500" : q.correctPct >= 40 ? "bg-warning-500" : "bg-danger-500")}
                        style={{ width: `${q.correctPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              {questionAnalysis.length === 0 && <p className="text-sm text-ink-500">No questions yet.</p>}
              <p className="pt-1 text-[10px] text-ink-400">Correct rate on the 5 trickiest questions.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
