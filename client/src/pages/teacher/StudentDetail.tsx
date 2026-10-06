import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flame, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import type { StudentDetailReport } from "@/lib/types";
import { AttemptsScoreChart, SkillBarChart } from "@/components/charts";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, PageLoader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { LEVEL_LABEL, SKILL_ACCENT, SKILL_LABEL, fmtDateTime, fmtDuration, scoreTone } from "@/lib/utils";

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => api.get<StudentDetailReport>(`/analytics/students/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading || !data) return <PageLoader label="Loading student…" />;

  const { student, summary, skillChart, dailyChart, recentAttempts } = data;

  return (
    <>
      <Link to="/students" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" /> All students
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar src={student.avatarUrl} firstName={student.firstName} lastName={student.lastName} className="h-11 w-11 text-base" />
            {student.firstName} {student.lastName}
          </span>
        }
        subtitle={
          <span>
            @{student.username} · {student.level ? LEVEL_LABEL[student.level] : "no level"} · joined {fmtDateTime(student.joinedAt)}
          </span>
        }
        actions={
          <>
            <Badge tone={student.status === "ACTIVE" ? "green" : "gray"}>{student.status}</Badge>
            <Badge tone="amber">
              <Flame className="h-3 w-3" /> {student.streak.currentStreak}-day streak
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tests completed" value={summary.testsCompleted} />
        <StatCard label="Average score" value={`${summary.averageScore}%`} tone="green" />
        <StatCard label="Best score" value={`${summary.bestScore}%`} tone="brand" />
        <StatCard label="Study time" value={fmtDuration(summary.totalSeconds)} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skill profile</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillBarChart data={skillChart} horizontal />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily attempts — 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <AttemptsScoreChart data={dailyChart} height={240} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent attempts</CardTitle>
            <Badge tone="gray">{recentAttempts.length} shown</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Group</TH>
                  <TH>Score</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {recentAttempts.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link to={`/tests/${a.test.id}/results`} className="font-medium text-ink-900 hover:text-brand-600">
                        {a.test.title}
                      </Link>
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[a.test.skill]}`}>
                        {SKILL_LABEL[a.test.skill]}
                      </span>
                    </TD>
                    <TD className="text-xs">{a.group ?? "—"}</TD>
                    <TD>
                      <span className={cn2(a.percentage)}>{a.percentage}%</span>
                    </TD>
                    <TD className="text-xs">{fmtDateTime(a.submittedAt ?? a.startedAt)}</TD>
                    <TD>
                      {a.status === "IN_PROGRESS" ? <Badge tone="amber">In progress</Badge> : <Badge tone="green">{a.status === "TIME_UP" ? "Time up" : "Submitted"}</Badge>}
                    </TD>
                  </TR>
                ))}
                {recentAttempts.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="text-center text-ink-400">
                      No attempts yet.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Groups</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {student.groups.length === 0 && <p className="text-xs text-ink-500">Not in any group.</p>}
              {student.groups.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`}>
                  <Badge tone="indigo">
                    {g.name} · {LEVEL_LABEL[g.level]}
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Streak record</CardTitle>
              <Trophy className="h-4 w-4 text-ink-400" />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Current</span>
                <span className="font-bold text-ink-900">{student.streak.currentStreak} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Longest</span>
                <span className="font-bold text-ink-900">{student.streak.longestStreak} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Last active</span>
                <span className="font-medium text-ink-800">{student.streak.lastActivityOn ? fmtDateTime(student.streak.lastActivityOn) : "—"}</span>
              </div>
            </CardContent>
          </Card>
          <Link to="/ai">
            <Button variant="outline" className="w-full">
              AI analysis for this student
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

function cn2(pct: number) {
  return scoreTone(pct);
}
