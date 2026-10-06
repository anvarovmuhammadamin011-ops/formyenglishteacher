import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, Lock, User2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/utils";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
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
            <h2 className="text-lg font-bold text-ink-900">Sign in to ELMS</h2>
            <p className="mt-1 text-xs text-ink-500">Use the account your teacher gave you.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Username">
              <div className="relative">
                <User2 className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. teacher"
                  autoComplete="username"
                  className="pl-8"
                  autoFocus
                />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-8"
                />
              </div>
            </Field>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-5 rounded-lg bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500 ring-1 ring-ink-200">
            <p className="font-semibold text-ink-600">Demo accounts</p>
            <p>Teacher: <code className="font-mono">teacher / Teacher123!</code></p>
            <p>Student: <code className="font-mono">aziza.rasulova / student123</code></p>
          </div>
        </Card>
      </div>
    </div>
  );
}
