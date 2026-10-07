import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv, stamp } from "@/lib/export";
import type { Paginated, TeacherAssignment } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
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
import { cn, fmtDateTime, fmtDuration } from "@/lib/utils";

export default function AssignmentsPage() {
  const [page, setPage] = useState(1);
  const [groupId, setGroupId] = useState("");
  const [upcoming, setUpcoming] = useState(false);

  const assignments = useQuery({
    queryKey: ["assignments", page, groupId, upcoming],
    queryFn: () =>
      api.get<Paginated<TeacherAssignment>>("/assignments", {
        query: { page, limit: 15, ...(groupId ? { groupId } : {}), ...(upcoming ? { upcoming: true } : {}) },
      }),
    placeholderData: (prev) => prev,
  });

  const groups = useQuery({
    queryKey: ["group-options"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/groups/options"),
  });

  const items = assignments.data?.items ?? [];
  const pages = assignments.data?.pages ?? 1;

  return (
    <>
      <PageHeader
        title="Assignments"
        subtitle="Every test assigned to a group, with completion status."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `assignments_${stamp()}`,
                ["Test", "Group", "Assigned by", "Start", "Deadline", "Students", "Completed", "Completion %", "Max attempts", "Status"],
                items.map((a) => [
                  a.test.title,
                  a.group.name,
                  `${a.assignedBy.firstName} ${a.assignedBy.lastName}`,
                  a.startAt,
                  a.deadlineAt,
                  a.studentCount,
                  a.completedCount,
                  a.completionRate,
                  a.maxAttempts,
                  a.status,
                ]),
              )
            }
          >
            <Download className="mr-1 h-3 w-3" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={groupId} onChange={(e) => { setGroupId(e.target.value); setPage(1); }} className="w-48">
          <option value="">All groups</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={upcoming}
            onChange={(e) => { setUpcoming(e.target.checked); setPage(1); }}
            className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Active deadlines only
        </label>
        <span className="ml-auto text-xs text-ink-400">{assignments.data?.total ?? 0} assignments</span>
      </div>

      {assignments.isLoading ? (
        <PageLoader label="Loading assignments…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No assignments"
          hint="Assign a published test to a group from the Tests page."
          icon={<CalendarClock className="h-8 w-8" />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Group</TH>
                  <TH>Window</TH>
                  <TH>Duration</TH>
                  <TH>Completion</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((a) => {
                  const past = new Date(a.deadlineAt) < new Date();
                  return (
                    <TR key={a.id}>
                      <TD>
                        <Link to={`/tests/${a.test.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                          {a.test.title}
                        </Link>
                        <span className="block text-[10px] text-ink-400">
                          by {a.assignedBy.firstName} {a.assignedBy.lastName} · max {a.maxAttempts} attempt
                          {a.maxAttempts === 1 ? "" : "s"}
                        </span>
                      </TD>
                      <TD className="text-xs">{a.group.name}</TD>
                      <TD className="text-xs">
                        <span className="block text-ink-500">{fmtDateTime(a.startAt)}</span>
                        <span className={cn("block", past ? "text-danger-500" : "text-ink-800")}>
                          → {fmtDateTime(a.deadlineAt)}
                        </span>
                      </TD>
                      <TD className="text-xs">{a.durationSeconds ? fmtDuration(a.durationSeconds) : "untimed"}</TD>
                      <TD className="w-44">
                        <ProgressBar value={a.completionRate} tone={a.completionRate >= 80 ? "green" : a.completionRate >= 40 ? "amber" : "red"} />
                        <span className="mt-0.5 block text-[10px] text-ink-400">
                          {a.completedCount}/{a.studentCount} students · {a.completionRate}%
                        </span>
                      </TD>
                      <TD>
                        {past ? <Badge tone="gray">closed window</Badge> : <Badge tone="green">open</Badge>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-ink-500">
          <button
            className="rounded border border-ink-200 px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="rounded border border-ink-200 px-2 py-1 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
