import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import type { GroupDetailReport } from "@/lib/types";
import { SkillBarChart } from "@/components/charts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Modal,
  PageHeader,
  PageLoader,
  ProgressBar,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { LEVEL_LABEL, SKILL_ACCENT, SKILL_LABEL, cn, fmtDateTime, scoreTone } from "@/lib/utils";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pickStudent, setPickStudent] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["group-detail", id],
    queryFn: () => api.get<GroupDetailReport>(`/analytics/groups/${id}`),
    enabled: Boolean(id),
  });

  const students = useQuery({
    queryKey: ["student-options"],
    queryFn: () => api.get<Array<{ id: string; label: string; group: { id: string; name: string } | null; status: string }>>("/students/options"),
    enabled: addOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["group-detail", id] });

  const addMember = useMutation({
    mutationFn: () => api.post(`/groups/${id}/members`, { studentId: pickStudent }),
    onSuccess: () => {
      toast.success("Student added");
      setAddOpen(false);
      setPickStudent("");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = useMutation({
    mutationFn: (studentId: string) => api.del(`/groups/${id}/members/${studentId}`),
    onSuccess: () => {
      toast.success("Student removed");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data) return <PageLoader label="Loading group…" />;

  const { group, skillAverages, members, assignments } = data;
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = (students.data ?? []).filter((s) => !memberIds.has(s.id) && s.status === "ACTIVE");

  return (
    <>
      <Link to="/groups" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-3 w-3" /> All groups
      </Link>

      <PageHeader
        title={group.name}
        subtitle={`${LEVEL_LABEL[group.level]} · ${group.studentCount} students · created ${fmtDateTime(group.createdAt)}`}
        actions={
          <>
            <Badge tone={group.status === "ACTIVE" ? "green" : "gray"}>{group.status}</Badge>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add student
            </Button>
            <Link to="/tests">
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" /> Assign test
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Skill averages</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillBarChart data={skillAverages} horizontal height={220} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <Badge tone="gray">{assignments.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignments.length === 0 && <p className="text-sm text-ink-500">No assignments yet for this group.</p>}
            {assignments.map((a) => {
              const pct = a.students ? Math.round((a.completed / a.students) * 100) : 0;
              return (
                <Link key={a.id} to={`/tests/${a.testId}/results`} className="block rounded-lg border border-ink-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink-900">{a.title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[a.skill]}`}>
                      {SKILL_LABEL[a.skill]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={pct} className="flex-1" />
                    <span className="text-xs text-ink-500">
                      {a.completed}/{a.students}
                    </span>
                    <span className={cn("text-xs font-bold", scoreTone(a.averageScore))}>
                      {a.averageScore !== null ? `${a.averageScore}%` : "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-ink-400">
                    due {fmtDateTime(a.deadlineAt)} · {a.status.toLowerCase()}
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <Badge tone="gray">{members.length} students</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No members yet" hint="Add students to this group to assign tests." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Joined</TH>
                  <TH>Streak</TH>
                  <TH>Tests</TH>
                  <TH>Avg</TH>
                  <TH>Skill mix</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {members.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link to={`/students/${m.id}`} className="flex items-center gap-2.5 hover:text-brand-600">
                        <Avatar src={m.avatarUrl} firstName={m.firstName} lastName={m.lastName} />
                        <span>
                          <span className="block font-medium text-ink-900">
                            {m.firstName} {m.lastName}
                          </span>
                          <span className="block text-[10px] text-ink-400">@{m.username}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-xs">{fmtDateTime(m.joinedAt)}</TD>
                    <TD className="text-xs text-amber-600">🔥 {m.streak}</TD>
                    <TD>{m.tests}</TD>
                    <TD>
                      <span className={cn("font-bold", scoreTone(m.averageScore))}>
                        {m.averageScore !== null ? `${m.averageScore}%` : "—"}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {m.skills
                          .filter((s) => s.attempts > 0)
                          .slice(0, 5)
                          .map((s) => (
                            <span key={s.skill} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[s.skill]}`}>
                              {SKILL_LABEL[s.skill].slice(0, 4)} {s.averageScore}
                            </span>
                          ))}
                        {m.vocabulary > 0 && <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">VOC {m.vocabulary}</span>}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="text-danger-500"
                        title="Remove from group"
                        onClick={() => removeMember.mutate(m.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add student to group"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!pickStudent || addMember.isPending} onClick={() => addMember.mutate()}>
              {addMember.isPending ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        {students.isLoading ? (
          <PageLoader />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-ink-500">Every active student is already in this group.</p>
        ) : (
          <Select value={pickStudent} onChange={(e) => setPickStudent(e.target.value)}>
            <option value="">Choose a student…</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} {s.group ? `(${s.group.name})` : "(no group)"}
              </option>
            ))}
          </Select>
        )}
      </Modal>
    </>
  );
}
