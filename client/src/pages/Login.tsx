import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, Loader2, Presentation, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/utils";

type Role = "TEACHER" | "STUDENT";

const ACCOUNTS: Record<Role, { username: string; password: string; label: string; desc: string }> = {
  TEACHER: {
    username: "teacher",
    password: "Teacher123!",
    label: "Teacher",
    desc: "Groups · tests · analytics",
  },
  STUDENT: {
    username: "ali.karimov",
    password: "student123",
    label: "Student",
    desc: "Tests · vocabulary · rankings",
  },
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<Role | null>(null);
  const [offline, setOffline] = useState<string | null>(null);

  async function enter(role: Role) {
    if (active) return;
    setActive(role);
    setOffline(null);
    try {
      const acc = ACCOUNTS[role];
      const user = await login(acc.username, acc.password);
      toast.success(`Welcome, ${user.firstName}!`);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "API_OFFLINE") {
        setOffline(err.message);
      } else {
        toast.error(errorMessage(err));
      }
      setActive(null);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col justify-between bg-ink-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-black">E</span>
          <span className="text-lg font-bold">ELMS</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Your personal English teaching <span className="text-brand-400">operating system</span>.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Plan groups, build tests, track every learner's progress, and let AI handle the busywork — from test
            generation to writing feedback.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/70">
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Tests, assignments and auto-graded attempts
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Reading, listening, vocabulary and writing
              practice
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Live analytics, streaks and rankings
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/40">English Learning Management System</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-ink-100 px-4">
        <Card className="w-full max-w-sm p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-ink-900">Enter ELMS</h2>
            <p className="mt-1 text-xs text-ink-500">Choose how you want to sign in.</p>
          </div>

          {offline && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Backend not connected</p>
              <p className="mt-1 leading-relaxed">{offline}</p>
            </div>
          )}

          <div className="space-y-3">
            {(Object.keys(ACCOUNTS) as Role[]).map((role) => {
              const acc = ACCOUNTS[role];
              const isLoading = active === role;
              const disabled = active !== null;
              return (
                <button
                  key={role}
                  type="button"
                  disabled={disabled}
                  onClick={() => enter(role)}
                  className={`group flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition-all
                    ${isLoading ? "border-brand-400 bg-brand-50 ring-2 ring-brand-500/30" : "border-ink-200 bg-white hover:border-brand-400 hover:bg-brand-50/50 hover:shadow-sm"}
                    ${disabled && !isLoading ? "opacity-50" : ""}`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors
                      ${role === "TEACHER" ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"}`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : role === "TEACHER" ? (
                      <Presentation className="h-5 w-5" />
                    ) : (
                      <UserRound className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink-900">
                      {isLoading ? "Signing in…" : acc.label}
                    </span>
                    <span className="block text-xs text-ink-500">{acc.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-center text-[11px] text-ink-400">
            Quick access — demo accounts are pre-filled automatically.
          </p>
        </Card>
      </div>
    </div>
  );
}
