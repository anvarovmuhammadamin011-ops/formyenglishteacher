import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, CalendarCheck, Clock, Flame, Play, RotateCcw, Target, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import type { AttemptView, StudentDashboard } from "@/lib/types";
import { SkillRing } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { SKILL_ACCENT, SKILL_LABEL, errorMessage, fmtDateTime, fmtShort, scoreTone } from "@/lib/utils";

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "me"],
    queryFn: () => api.get<StudentDashboard>("/analytics/me"),
  });

  const startTest = useMutation({
    mutationFn: (assignmentId: string) => api.post<AttemptView>("/attempts/start", { assignmentId }),
    onSuccess: (attempt) => {
      qc.invalidateQueries({ queryKey: ["analytics", "me"] });
      navigate(`/attempts/${attempt.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading || !data) return <PageLoader label="Loading your dashboard…" />;

  const { streak, summary, skillProgress, inProgressTests, upcoming, recentAttempts, calendar } = data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="My dashboard"
        subtitle="Keep your streak alive and see what's due next."
        actions={
          <Badge tone={streak.current > 0 ? "amber" : "gray"} className="text-xs">
            <Flame className="h-3 w-3" /> {streak.current}-day streak · best {streak.longest}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tests completed" value={summary.testsCompleted} icon={<Target className="h-4 w-4" />} tone="brand" />
        <StatCard label="Average score" value={`${summary.averageScore}%`} icon={<Award className="h-4 w-4" />} tone="green" />
        <StatCard
          label="Rank"
          value={summary.rank ? `#${summary.rank}` : "—"}
          sub={summary.totalStudents ? `of ${summary.totalStudents} students` : undefined}
          icon={<Trophy className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label="Study time"
          value={`${Math.round(summary.totalSeconds / 60)}m`}
          sub={`${summary.inProgress} test in progress`}
          icon={<Clock className="h-4 w-4" />}
          tone="ink"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Skill progress</CardTitle>
            <Badge tone="gray">accuracy across all practice</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-around gap-3 py-2">
            {skillProgress.map((s) => (
              <SkillRing key={s.skill} value={s.accuracy} label={SKILL_LABEL[s.skill]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
            <CalendarCheck className="h-4 w-4 text-ink-400" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-10 gap-1.5">
              {calendar.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}${day.active ? " · active" : ""}`}
                  className={`aspect-square rounded-md ${
                    day.date === today
                      ? "ring-2 ring-brand-500 ring-offset-1"
                      : day.active
                        ? "bg-brand-500"
                        : "bg-ink-200"
                  }`}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-500">
              {calendar.filter((d) => d.active).length} active days in the last month.
            </p>
          </CardContent>
        </Card>
      </div>

      {inProgressTests.length > 0 && (
        <Card className="mt-4 border-brand-200 bg-brand-50/40">
          <CardHeader className="border-brand-100">
            <CardTitle>Tests in progress</CardTitle>
            <Badge tone="default">resume anytime</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {inProgressTests.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 ring-1 ring-ink-200">
                <div>
                  <p className="text-sm font-medium text-ink-900">{t.title}</p>
                  <p className="text-xs text-ink-500">
                    started {fmtDateTime(t.startedAt)}
                    {t.expiresAt && ` · expires ${fmtDateTime(t.expiresAt)}`}
                  </p>
                </div>
                <Button size="sm" onClick={() => navigate(`/attempts/${t.id}`)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Resume
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming assignments</CardTitle>
            <Link to="/tests" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {upcoming.length === 0 && <p className="text-sm text-ink-500">Nothing due right now. 🎉</p>}
            {upcoming.slice(0, 6).map((u) => (
              <div key={u.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[u.skill]}`}>
                      {SKILL_LABEL[u.skill]}
                    </span>
                    <p className="truncate text-sm font-medium text-ink-900">{u.title}</p>
                    {u.finished && u.bestScore !== null && (
                      <span className={`text-xs font-semibold ${scoreTone(u.bestScore)}`}>best {u.bestScore}%</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {u.group} · due {fmtDateTime(u.deadlineAt)} · {Math.round(u.timeLimitSeconds / 60)} min
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={u.finished ? "outline" : "default"}
                  disabled={startTest.isPending}
                  onClick={() => startTest.mutate(u.assignmentId)}
                >
                  <Play className="h-3.5 w-3.5" />
                  {u.finished ? "Retry" : "Start test"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAttempts.length === 0 && (
              <EmptyState title="No tests yet" hint="Your results will show up here." />
            )}
            {recentAttempts.slice(0, 7).map((a) => (
              <Link key={a.id} to={`/results/${a.id}`} className="block rounded-lg border border-ink-200 p-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-ink-800">{a.test.title}</p>
                  <span className={`text-sm font-bold ${scoreTone(a.percentage)}`}>{a.percentage}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-500">
                  <span>
                    {a.correct}/{a.total} correct
                  </span>
                  <span>{a.submittedAt ? fmtShort(a.submittedAt) : "in progress"}</span>
                </div>
                <ProgressBar value={a.percentage} className="mt-1.5" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
