import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Flame,
  ListChecks,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { TeacherDashboard } from "@/lib/types";
import { SkillBarChart, TrendChart } from "@/components/charts";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, PageLoader, ProgressBar, StatCard, TD, TH, TR, TBody, THead, Table } from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, fmtDateTime, fmtTimeAgo } from "@/lib/utils";

export default function TeacherDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "dashboard"],
    queryFn: () => api.get<TeacherDashboard>("/analytics/dashboard"),
  });

  if (isLoading || !data) return <PageLoader label="Loading dashboard…" />;

  const { summary, chart, skillBreakdown, upcomingDeadlines, recentActivity } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything happening across your classes in the last 30 days."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Students" value={summary.students} icon={<Users className="h-4 w-4" />} tone="brand" />
        <StatCard label="Groups" value={summary.groups} icon={<ListChecks className="h-4 w-4" />} tone="ink" />
        <StatCard label="Tests" value={summary.tests} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
        <StatCard label="Attempts (30d)" value={summary.attempts30d} icon={<BarChart3 className="h-4 w-4" />} tone="amber" />
        <StatCard label="Avg score (30d)" value={`${summary.averageScore30d}%`} icon={<Flame className="h-4 w-4" />} tone="red" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity — last 14 days</CardTitle>
            <Badge tone="gray">attempts & average score</Badge>
          </CardHeader>
          <CardContent>
            <TrendChart data={chart} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Skill breakdown — 90 days</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillBarChart data={skillBreakdown} horizontal height={240} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming deadlines</CardTitle>
            <Link to="/assignments" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              All assignments <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingDeadlines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No upcoming deadlines.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Test</TH>
                    <TH>Group</TH>
                    <TH>Deadline</TH>
                    <TH className="w-44">Progress</TH>
                  </TR>
                </THead>
                <TBody>
                  {upcomingDeadlines.slice(0, 7).map((d) => {
                    const pct = d.students ? Math.round((d.completed / d.students) * 100) : 0;
                    return (
                      <TR key={d.id}>
                        <TD>
                          <Link to={`/tests/${d.testId}`} className="font-medium text-ink-900 hover:text-brand-600">
                            {d.title}
                          </Link>
                          <span className="ml-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[d.skill]}`}>
                              {SKILL_LABEL[d.skill]}
                            </span>
                          </span>
                        </TD>
                        <TD>{d.group}</TD>
                        <TD className="whitespace-nowrap text-xs">{fmtDateTime(d.deadlineAt)}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={pct} className="flex-1" />
                            <span className="w-16 text-right text-xs text-ink-500">
                              {d.completed}/{d.students}
                            </span>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CalendarClock className="h-4 w-4 text-ink-400" />
          </CardHeader>
          <CardContent className="space-y-3.5">
            {recentActivity.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink-700">
                    <span className="font-semibold text-ink-900">
                      {a.user.firstName} {a.user.lastName}
                    </span>{" "}
                    · {a.type.replaceAll("_", " ").toLowerCase()}
                  </p>
                  <p className="text-[10px] text-ink-400">{fmtTimeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && <p className="text-xs text-ink-500">No recent activity.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
