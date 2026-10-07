import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, KeyRound, Plus, Search, Trash2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv, stamp } from "@/lib/export";
import type { Level, Paginated, StudentRow } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TBody,
} from "@/components/ui";
import { LEVEL_LABEL, errorMessage, fmtTimeAgo } from "@/lib/utils";

interface StudentForm {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  age: string;
  phone: string;
  level: Level;
  groupId: string;
}

const emptyForm: StudentForm = {
  firstName: "",
  lastName: "",
  username: "",
  password: "student123",
  age: "",
  phone: "",
  level: "INTERMEDIATE",
  groupId: "",
};

export default function StudentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [resetFor, setResetFor] = useState<StudentRow | null>(null);
  const [newPassword, setNewPassword] = useState("student123");
  const [deleteFor, setDeleteFor] = useState<StudentRow | null>(null);

  const students = useQuery({
    queryKey: ["students", search, groupId, status, page],
    queryFn: () =>
      api.get<Paginated<StudentRow>>("/students", {
        query: { search, groupId, status, page, limit: 12, sort: "name" },
      }),
    placeholderData: (prev) => prev,
  });

  const groups = useQuery({
    queryKey: ["group-options"],
    queryFn: () => api.get<Array<{ id: string; name: string; level: Level }>>("/groups/options"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["students"] });

  const saveStudent = useMutation({
    mutationFn: () => {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim(),
        ...(editing
          ? {
              age: form.age ? Number(form.age) : null,
              phone: form.phone || null,
              level: form.level,
              groupId: form.groupId || null,
            }
          : {
              password: form.password,
              age: form.age ? Number(form.age) : undefined,
              phone: form.phone || undefined,
              level: form.level,
              groupId: form.groupId || undefined,
            }),
      };
      return editing ? api.patch(`/students/${editing.id}`, payload) : api.post("/students", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Student updated" : "Student created");
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleStatus = useMutation({
    mutationFn: (s: StudentRow) => api.post(`/students/${s.id}/status`),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/students/${resetFor!.id}/password`, { password: newPassword }),
    onSuccess: () => {
      toast.success("Password reset");
      setResetFor(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeStudent = useMutation({
    mutationFn: () => api.del(`/students/${deleteFor!.id}`),
    onSuccess: () => {
      toast.success("Student deleted");
      setDeleteFor(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(s: StudentRow) {
    setEditing(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      username: s.username,
      password: "",
      age: s.age ? String(s.age) : "",
      phone: s.phone ?? "",
      level: s.studentProfile?.level ?? "INTERMEDIATE",
      groupId: s.group?.id ?? "",
    });
    setFormOpen(true);
  }

  const rows = students.data?.items ?? [];
  const total = students.data?.total ?? 0;
  const pages = students.data?.pages ?? 1;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${total} enrolled`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `students_${stamp()}`,
                  ["Name", "Username", "Level", "Group", "Status", "Age", "Phone", "Streak", "Created", "Last login"],
                  rows.map((s) => [
                    `${s.firstName} ${s.lastName}`,
                    s.username,
                    s.studentProfile?.level ?? "",
                    s.group?.name ?? "",
                    s.status,
                    s.age ?? "",
                    s.phone ?? "",
                    s.streak?.currentStreak ?? 0,
                    s.createdAt,
                    s.lastLoginAt ?? "",
                  ]),
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add student
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            placeholder="Search by name or username…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <Select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All groups</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {students.isLoading ? (
            <PageLoader />
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No students found" hint="Try a different filter or add a new student." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Group</TH>
                  <TH>Level</TH>
                  <TH>Streak</TH>
                  <TH>Last login</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link to={`/students/${s.id}`} className="flex items-center gap-2.5 hover:text-brand-600">
                        <Avatar src={s.avatarUrl} firstName={s.firstName} lastName={s.lastName} />
                        <span>
                          <span className="block font-medium text-ink-900">
                            {s.firstName} {s.lastName}
                          </span>
                          <span className="block text-[10px] text-ink-400">@{s.username}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-xs">{s.group?.name ?? <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-xs">{s.studentProfile ? LEVEL_LABEL[s.studentProfile.level] : "—"}</TD>
                    <TD>
                      <span className="text-xs font-semibold text-amber-600">🔥 {s.streak?.currentStreak ?? 0}</span>
                    </TD>
                    <TD className="text-xs text-ink-500">{s.lastLoginAt ? fmtTimeAgo(s.lastLoginAt) : "never"}</TD>
                    <TD>
                      {s.status === "ACTIVE" ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="iconSm" title="Edit" onClick={() => openEdit(s)}>
                          <UserRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="iconSm" title="Reset password" onClick={() => { setResetFor(s); setNewPassword("student123"); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="iconSm" title={s.status === "ACTIVE" ? "Deactivate" : "Activate"} onClick={() => toggleStatus.mutate(s)}>
                          <Badge tone={s.status === "ACTIVE" ? "gray" : "green"}>{s.status === "ACTIVE" ? "Off" : "On"}</Badge>
                        </Button>
                        <Button variant="ghost" size="iconSm" title="Delete" className="text-danger-500" onClick={() => setDeleteFor(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-ink-500">
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

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? `Edit ${editing.firstName} ${editing.lastName}` : "Add new student"}
        description={editing ? "Update account details and group." : "Create a student account with a login."}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saveStudent.isPending}
              onClick={() => {
                if (!form.firstName || !form.lastName || !form.username || (!editing && form.password.length < 6)) {
                  toast.error("Fill all required fields (password ≥ 6 chars).");
                  return;
                }
                saveStudent.mutate();
              }}
            >
              {saveStudent.isPending ? "Saving…" : editing ? "Save changes" : "Create student"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name *">
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name *">
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
          <Field label="Username *">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={Boolean(editing)} placeholder={editing ? "Username cannot be changed." : "e.g. aziza.rasulova"} />
          </Field>
          {!editing && (
            <Field label="Password *">
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          <Field label="Age">
            <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 …" />
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
          <Field label="Group">
            <Select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
              <option value="">No group</option>
              {(groups.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Reset password */}
      <Modal
        open={Boolean(resetFor)}
        onOpenChange={(o) => !o && setResetFor(null)}
        title={`Reset password — ${resetFor?.firstName ?? ""}`}
        description="The student signs in with this password afterwards."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={resetPassword.isPending} onClick={() => resetPassword.mutate()}>
              Reset password
            </Button>
          </>
        }
      >
        <Field label="New password" hint="Minimum 6 characters.">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteFor)}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Delete student?"
        message={`${deleteFor?.firstName} ${deleteFor?.lastName} will be removed. Their attempts stay in reports.`}
        confirmLabel="Delete"
        danger
        loading={removeStudent.isPending}
        onConfirm={() => removeStudent.mutate()}
      />
    </>
  );
}
