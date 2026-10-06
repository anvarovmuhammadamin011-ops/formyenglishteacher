import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Level, Paginated, Skill } from "@/lib/types";
import { AssignDialog } from "@/components/AssignDialog";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { LEVEL_LABEL, SKILL_ACCENT, SKILL_LABEL, cn, errorMessage, fmtDuration } from "@/lib/utils";

interface TestListRow {
  id: string;
  title: string;
  topic: string | null;
  skill: Skill;
  difficulty: Level;
  type: "MANUAL" | "AI";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  timeLimitSeconds: number;
  passingScore: number;
  createdAt: string;
  updatedAt: string;
  _count: { questions: number; attempts: number };
  assignments: Array<{ groupId: string; group: { name: string } }>;
}

export default function TestsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [skill, setSkill] = useState("");
  const [page, setPage] = useState(1);
  const [assignFor, setAssignFor] = useState<TestListRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<TestListRow | null>(null);

  const tests = useQuery({
    queryKey: ["tests", search, status, skill, page],
    queryFn: () =>
      api.get<Paginated<TestListRow>>("/tests", {
        query: { search, status, skill, page, limit: 12 },
      }),
    placeholderData: (prev) => prev,
  });

  const deleteTest = useMutation({
    mutationFn: () => api.del(`/tests/${deleteFor!.id}`),
    onSuccess: () => {
      toast.success("Test deleted");
      setDeleteFor(null);
      qc.invalidateQueries({ queryKey: ["tests"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = tests.data?.items ?? [];
  const pages = tests.data?.pages ?? 1;

  const statusTone = (s: string) => (s === "PUBLISHED" ? "green" : s === "DRAFT" ? "amber" : "gray");

  return (
    <>
      <PageHeader
        title="Tests"
        subtitle="Build, publish and assign tests to your groups."
        actions={
          <Button size="sm" onClick={() => navigate("/tests/new")}>
            <Plus className="h-3.5 w-3.5" /> New test
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search tests…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Select value={skill} onChange={(e) => { setSkill(e.target.value); setPage(1); }} className="w-40">
          <option value="">All skills</option>
          {(Object.keys(SKILL_LABEL) as Skill[]).map((s) => (
            <option key={s} value={s}>
              {SKILL_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      {tests.isLoading ? (
        <PageLoader label="Loading tests…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tests yet"
          hint="Create a test manually or generate one with AI."
          action={
            <Button size="sm" onClick={() => navigate("/tests/new")}>
              <Plus className="h-3.5 w-3.5" /> New test
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Skill</TH>
                  <TH>Difficulty</TH>
                  <TH>Questions</TH>
                  <TH>Attempts</TH>
                  <TH>Assigned</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link to={`/tests/${t.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {t.title}
                      </Link>
                      <span className="block text-[10px] text-ink-400">
                        {t.topic ?? "no topic"} · {fmtDuration(t.timeLimitSeconds)} · pass {t.passingScore}%
                      </span>
                      {t.type === "AI" && (
                        <Badge tone="indigo" className="mt-0.5">
                          AI
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SKILL_ACCENT[t.skill]}`}>
                        {SKILL_LABEL[t.skill]}
                      </span>
                    </TD>
                    <TD className="text-xs">{LEVEL_LABEL[t.difficulty]}</TD>
                    <TD>{t._count.questions}</TD>
                    <TD>{t._count.attempts}</TD>
                    <TD className="text-xs">
                      {t.assignments.length === 0 ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        t.assignments.map((a) => a.group.name).join(", ")
                      )}
                    </TD>
                    <TD>
                      <Badge tone={statusTone(t.status)}>{t.status.toLowerCase()}</Badge>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="iconSm" title="Assign" onClick={() => setAssignFor(t)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        <Link to={`/tests/${t.id}/results`}>
                          <Button variant="ghost" size="iconSm" title="Results">
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="iconSm" title="Edit" onClick={() => navigate(`/tests/${t.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="iconSm" title="Delete" className="text-danger-500" onClick={() => setDeleteFor(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className={cn("mt-3 flex items-center justify-end gap-2 text-xs text-ink-500")}>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {assignFor && (
        <AssignDialog testId={assignFor.id} testTitle={assignFor.title} open={Boolean(assignFor)} onOpenChange={(o) => !o && setAssignFor(null)} />
      )}

      <ConfirmDialog
        open={Boolean(deleteFor)}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Delete test?"
        message={`"${deleteFor?.title}" and its questions will be removed. Past attempts keep their data in reports.`}
        confirmLabel="Delete"
        danger
        loading={deleteTest.isPending}
        onConfirm={() => deleteTest.mutate()}
      />
    </>
  );
}
