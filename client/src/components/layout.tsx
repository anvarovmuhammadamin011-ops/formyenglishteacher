import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  FileText,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  PenLine,
  FlaskConical,
  Settings,
  Sparkles,
  Trophy,
  Users,
  UsersRound,
  X,
  ListChecks,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui";
import { cn, fmtTimeAgo } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const TEACHER_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: "/analytics", label: "Analytics", icon: <Trophy className="h-4 w-4" /> },
      { to: "/calendar", label: "Calendar", icon: <CalendarDays className="h-4 w-4" /> },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/students", label: "Students", icon: <Users className="h-4 w-4" /> },
      { to: "/groups", label: "Groups", icon: <UsersRound className="h-4 w-4" /> },
    ],
  },
  {
    label: "Testing",
    items: [
      { to: "/tests", label: "Tests", icon: <FlaskConical className="h-4 w-4" /> },
      { to: "/assignments", label: "Assignments", icon: <ListChecks className="h-4 w-4" /> },
      { to: "/ai", label: "AI Center", icon: <Sparkles className="h-4 w-4" /> },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/vocabulary", label: "Vocabulary", icon: <BookOpen className="h-4 w-4" /> },
      { to: "/reading", label: "Reading", icon: <FileText className="h-4 w-4" /> },
      { to: "/listening", label: "Listening", icon: <Headphones className="h-4 w-4" /> },
      { to: "/writing", label: "Writing", icon: <PenLine className="h-4 w-4" /> },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> }],
  },
];

const STUDENT_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: "/tests", label: "My Tests", icon: <GraduationCap className="h-4 w-4" /> },
      { to: "/rankings", label: "Rankings", icon: <Trophy className="h-4 w-4" /> },
      { to: "/calendar", label: "Calendar", icon: <CalendarDays className="h-4 w-4" /> },
    ],
  },
  {
    label: "Learning",
    items: [
      { to: "/vocabulary", label: "Vocabulary", icon: <BookOpen className="h-4 w-4" /> },
      { to: "/reading", label: "Reading", icon: <FileText className="h-4 w-4" /> },
      { to: "/listening", label: "Listening", icon: <Headphones className="h-4 w-4" /> },
      { to: "/writing", label: "Writing", icon: <PenLine className="h-4 w-4" /> },
      { to: "/speaking", label: "Speaking", icon: <Mic className="h-4 w-4" /> },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> }],
  },
];

function useNotifications() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: Notification[]; total: number; unread: number }>("/notifications", { query: { limit: 15 } }),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return { ...query, markRead, markAll };
}

function NotificationBell() {
  const { data, markRead, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-ink-900">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-6 text-center text-xs text-ink-500">You're all caught up.</p>}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-ink-50 px-4 py-3 text-left transition-colors hover:bg-ink-50",
                    !n.readAt && "bg-brand-50/50",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink-800">
                    {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                    {n.title}
                  </span>
                  {n.body && <span className="line-clamp-2 text-xs text-ink-500">{n.body}</span>}
                  <span className="text-[10px] text-ink-400">{fmtTimeAgo(n.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-ink-100"
      >
        <Avatar src={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} />
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold leading-tight text-ink-800">
            {user.firstName} {user.lastName}
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-ink-400">{user.role.toLowerCase()}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-xl animate-fade-in">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-ink-50"
              onClick={() => {
                setOpen(false);
                navigate("/settings");
              }}
            >
              <Settings className="h-3.5 w-3.5" /> Settings
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-600 hover:bg-red-50"
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const sections = user?.role === "TEACHER" ? TEACHER_NAV : STUDENT_NAV;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">E</span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">ELMS</p>
          <p className="text-[10px] uppercase tracking-widest text-white/40">English LMS</p>
        </div>
        <button className="ml-auto text-white/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-brand-500/20 text-white shadow-sm ring-1 ring-inset ring-brand-400/30"
                        : "text-white/60 hover:bg-white/5 hover:text-white/90",
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-xs font-medium text-white/70">
          {user?.firstName} {user?.lastName}
        </p>
        <p className="truncate text-[10px] text-white/40">@{user?.username}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-ink-900 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-60 bg-ink-900 lg:hidden">{sidebar}</aside>
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-200 bg-white/90 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Badge tone={user?.role === "TEACHER" ? "indigo" : "green"} className="hidden sm:inline-flex">
            {user?.role === "TEACHER" ? "Teacher mode" : "Student mode"}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-brand-600 text-xl font-black text-white">E</span>
      <p className="text-sm text-ink-500">Loading ELMS…</p>
    </div>
  );
}
