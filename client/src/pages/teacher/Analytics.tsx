import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RankingRow, TeacherDashboard } from "@/lib/types";
import { SkillBarChart, TrendChart } from "@/components/charts";
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageLoader,
  ProgressBar,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { cn, fmtDateTime, scoreTone } from "@/lib/utils";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"all" | "7d" | "30d" | "90d">("30d");
  const [groupId, setGroupId] = useState("");

  const dash = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => api.get<TeacherDashboard>("/analytics/dashboard"),
  });

  const rankings = useQuery({
    queryKey: ["rankings", period, groupId],
    queryFn: () =>
      api.get<RankingRow[]>("/analytics/rankings", {
        query: { period, ...(groupId ? { groupId } : {}), limit: 30 },
      }),
  });

  const groups = useQuery({
    queryKey: ["group-options"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/groups/options"),
  });

  if (dash.isLoading) return <PageLoader label="Loading analytics…" />;
  const d = dash.data;

  return (
    <>
      <PageHeader title="Analytics" subtitle="Performance across your students, groups and skills." />

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Students" value={d.summary.students} />
            <StatCard label="Groups" value={d.summary.groups} />
            <StatCard label="Tests" value={d.summary.tests} />
            <StatCard label="Attempts (30d)" value={d.summary.attempts30d} tone="brand" />
            <StatCard label="Avg score (30d)" value={`${d.summary.averageScore30d}%`} tone={d.summary.averageScore30d >= 60 ? "green" : "amber"} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Daily activity</CardTitle>
                <Badge tone="gray">attempts & average score</Badge>
              </CardHeader>
              <CardContent>
                <TrendChart data={d.chart} height={260} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <SkillBarChart data={d.skillBreakdown} horizontal height={260} />
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Upcoming deadlines</CardTitle>
                <Link to="/assignments" className="text-xs font-medium text-brand-600 hover:underline">
                  All assignments →
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.upcomingDeadlines.length === 0 && <p className="text-sm text-ink-500">Nothing due soon.</p>}
                {d.upcomingDeadlines.map((x) => (
                  <div key={x.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/tests/${x.testId}`} className="truncate text-sm font-medium text-ink-900 hover:text-brand-600">
                          {x.title}
                        </Link>
                        <span className="shrink-0 text-xs text-ink-500">{fmtDateTime(x.deadlineAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone="gray">{x.group}</Badge>
                        <ProgressBar value={x.students ? Math.round((x.completed / x.students) * 100) : 0} className="flex-1" />
                        <span className="shrink-0 text-[10px] text-ink-400">
                          {x.completed}/{x.students}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.recentActivity.length === 0 && <p className="text-sm text-ink-500">No activity yet.</p>}
                {d.recentActivity.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <Avatar src={a.user.avatarUrl} firstName={a.user.firstName} lastName={a.user.lastName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs text-ink-700">
                        <span className="font-semibold">
                          {a.user.firstName} {a.user.lastName}
                        </span>{" "}
                        {a.type.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="text-[10px] text-ink-400">{fmtDateTime(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Student rankings</CardTitle>
          <div className="flex gap-2">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-40">
              <option value="">All groups</option>
              {(groups.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="w-32">
              <option value="all">All time</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rankings.isLoading ? (
            <PageLoader label="Loading rankings…" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Student</TH>
                  <TH>Tests</TH>
                  <TH>Avg score</TH>
                  <TH>Streak</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {(rankings.data ?? []).map((r) => (
                  <TR key={r.userId}>
                    <TD>
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                          r.rank === 1 ? "bg-warning-100 text-warning-700" : r.rank <= 3 ? "bg-ink-200 text-ink-700" : "text-ink-400",
                        )}
                      >
                        {r.rank}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar src={r.avatarUrl} firstName={r.name.split(" ")[0]} lastName={r.name.split(" ")[1] ?? ""} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-ink-900">{r.name}</p>
                          <p className="text-[10px] text-ink-400">@{r.username}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>{r.tests}</TD>
                    <TD>
                      <span className={cn("font-bold", scoreTone(r.averageScore))}>{r.averageScore}%</span>
                    </TD>
                    <TD className="text-xs">{r.streak} days</TD>
                    <TD className="text-right">
                      <Link to={`/students/${r.userId}`} className="text-xs font-medium text-brand-600 hover:underline">
                        Report →
                      </Link>
                    </TD>
                  </TR>
                ))}
                {(rankings.data ?? []).length === 0 && (
                  <TR>
                    <TD colSpan={6}>
                      <span className="text-sm text-ink-500">No students with attempts in this period.</span>
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
