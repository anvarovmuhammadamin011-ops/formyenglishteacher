import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Pencil, Plus, Search, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import type { Level, Paginated } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Textarea,
} from "@/components/ui";
import { LEVEL_LABEL, cn, errorMessage } from "@/lib/utils";

interface GroupRow {
  id: string;
  name: string;
  level: Level;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  teacher: string | null;
  studentCount: number;
  averageScore?: number | null;
  attemptsCount?: number;
}

interface GroupForm {
  name: string;
  level: Level;
  description: string;
}

export default function GroupsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [form, setForm] = useState<GroupForm>({ name: "", level: "INTERMEDIATE", description: "" });
  const [archiveFor, setArchiveFor] = useState<GroupRow | null>(null);

  const groups = useQuery({
    queryKey: ["groups", search, status],
    queryFn: () => api.get<Paginated<GroupRow>>("/groups", { query: { search, status, stats: true, limit: 60 } }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["groups"] });

  const saveGroup = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), level: form.level, description: form.description || undefined };
      return editing ? api.patch(`/groups/${editing.id}`, payload) : api.post("/groups", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Group updated" : "Group created");
      setFormOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const archiveGroup = useMutation({
    mutationFn: () => api.del(`/groups/${archiveFor!.id}`),
    onSuccess: () => {
      toast.success("Group archived");
      setArchiveFor(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = groups.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Classes you run — click a group for members, analytics and assignments."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm({ name: "", level: "INTERMEDIATE", description: "" });
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New group
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search groups…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      {groups.isLoading ? (
        <PageLoader label="Loading groups…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No groups yet"
          hint="Create your first group, then add students to it."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New group
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((g) => (
            <Card key={g.id} className={cn("group flex flex-col p-4 transition-shadow hover:shadow-md", g.status === "ARCHIVED" && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/groups/${g.id}`} className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-600">{g.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{LEVEL_LABEL[g.level]}</p>
                </Link>
                {g.status === "ARCHIVED" ? <Badge tone="gray">Archived</Badge> : <Badge tone="green">Active</Badge>}
              </div>

              {g.description && <p className="mt-2 line-clamp-2 text-xs text-ink-500">{g.description}</p>}

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-ink-50 p-2.5 text-center">
                <div>
                  <p className="text-lg font-bold text-ink-900">{g.studentCount}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">students</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-ink-900">{g.averageScore !== undefined && g.averageScore !== null ? `${g.averageScore}%` : "—"}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">avg score</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Link to={`/groups/${g.id}`} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <UsersRound className="h-3 w-3" /> Open
                </Link>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    title="Edit"
                    onClick={() => {
                      setEditing(g);
                      setForm({ name: g.name, level: g.level, description: g.description ?? "" });
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {g.status === "ACTIVE" && (
                    <Button variant="ghost" size="iconSm" title="Archive" onClick={() => setArchiveFor(g)}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit group" : "New group"}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saveGroup.isPending || !form.name.trim()} onClick={() => saveGroup.mutate()}>
              {saveGroup.isPending ? "Saving…" : editing ? "Save" : "Create group"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Group name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. IELTS 2026" />
          </Field>
          <Field label="Level">
            <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveFor)}
        onOpenChange={(o) => !o && setArchiveFor(null)}
        title="Archive group?"
        message={`${archiveFor?.name} will be hidden from active lists. Existing attempts are kept.`}
        confirmLabel="Archive"
        danger
        loading={archiveGroup.isPending}
        onConfirm={() => archiveGroup.mutate()}
      />
    </>
  );
}
