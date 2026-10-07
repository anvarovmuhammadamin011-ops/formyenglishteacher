import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, KeyRound, Sparkles, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { chatRaw, getAiConfig, setAiConfig } from "@/lib/ai";
import type { AiConfig } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import { LEVEL_LABEL, errorMessage, fmtDateTime } from "@/lib/utils";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [ai, setAi] = useState<AiConfig>(() => getAiConfig());
  const [aiTesting, setAiTesting] = useState(false);

  const saveAi = () => {
    setAiConfig({
      apiKey: ai.apiKey.trim(),
      model: ai.model.trim() || "deepseek-chat",
      baseUrl: ai.baseUrl.trim() || "https://api.deepseek.com/v1",
      provider: "deepseek",
    });
    setAi(getAiConfig());
    toast.success("AI settings saved");
  };

  const testAi = async () => {
    setAiTesting(true);
    try {
      saveAi();
      await chatRaw({
        messages: [{ role: "user", content: "Reply with the single word OK" }],
        requestType: "TEST",
        maxTokens: 16,
        json: false,
      });
      toast.success("AI is reachable");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAiTesting(false);
    }
  };

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("avatar", file);
      return api.upload<{ avatarUrl: string }>("/profile/avatar", form);
    },
    onSuccess: async () => {
      toast.success("Profile photo updated");
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeAvatar = useMutation({
    mutationFn: () => api.del("/profile/avatar"),
    onSuccess: async () => {
      toast.success("Profile photo removed");
      setRemoveOpen(false);
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/change-password", { currentPassword: pwd.current, newPassword: pwd.next }),
    onSuccess: () => {
      toast.success("Password changed");
      setPwd({ current: "", next: "", confirm: "" });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pwdError =
    pwd.next && pwd.confirm && pwd.next !== pwd.confirm ? "Passwords do not match." : pwd.next && pwd.next.length < 6 ? "Min 6 characters." : undefined;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and account security." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <Badge tone={user?.role === "TEACHER" ? "indigo" : "sky"}>{user?.role.toLowerCase()}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar src={user?.avatarUrl} firstName={user?.firstName} lastName={user?.lastName} className="h-16 w-16 text-lg" />
                <button
                  type="button"
                  title="Change photo"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 rounded-full bg-brand-600 p-1.5 text-white shadow-md transition-colors hover:bg-brand-700"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={uploadAvatar.isPending} onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                    {uploadAvatar.isPending ? "Uploading…" : "Upload"}
                  </Button>
                  {user?.avatarUrl && (
                    <Button size="sm" variant="outline" className="text-danger-600" onClick={() => setRemoveOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-ink-400">JPEG, PNG, WebP or GIF · max 2 MB</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input value={user?.firstName ?? ""} readOnly className="bg-ink-50" />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={user?.lastName ?? ""} readOnly className="bg-ink-50" />
              </div>
              <div>
                <Label>Username</Label>
                <Input value={user?.username ?? ""} readOnly className="bg-ink-50" />
              </div>
              <div>
                <Label>Level</Label>
                <Input
                  value={user?.studentProfile?.level ? LEVEL_LABEL[user.studentProfile.level] : user?.teacherProfile?.subject ?? "—"}
                  readOnly
                  className="bg-ink-50"
                />
              </div>
              {user?.group && (
                <div>
                  <Label>Group</Label>
                  <Input value={`${user.group.name} (${LEVEL_LABEL[user.group.level]})`} readOnly className="bg-ink-50" />
                </div>
              )}
              <div>
                <Label>Last login</Label>
                <Input value={fmtDateTime(user?.lastLoginAt)} readOnly className="bg-ink-50" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
            </Field>
            <Field label="New password" error={pwdError}>
              <Input type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            </Field>
            <Button
              disabled={
                changePassword.isPending ||
                !pwd.current ||
                !pwd.next ||
                pwd.next !== pwd.confirm ||
                pwd.next.length < 6
              }
              onClick={() => changePassword.mutate()}
            >
              <KeyRound className="h-4 w-4" />
              {changePassword.isPending ? "Updating…" : "Update password"}
            </Button>
            <p className="text-xs text-ink-400">Minimum 6 characters. You stay signed in after changing it.</p>
          </CardContent>
        </Card>

        {user?.role === "TEACHER" && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-600" /> AI (DeepSeek)
              </CardTitle>
              <Badge tone={ai.apiKey ? "green" : "gray"}>{ai.apiKey ? "configured" : "not set"}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="API key" hint="Saved only in this browser (localStorage).">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="sk-…"
                    value={ai.apiKey}
                    onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                  />
                </Field>
                <Field label="Model">
                  <Select value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })}>
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="deepseek-reasoner">deepseek-reasoner</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                  </Select>
                </Field>
                <Field label="Base URL">
                  <Input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveAi}>Save</Button>
                <Button variant="outline" disabled={aiTesting || !ai.apiKey.trim()} onClick={() => void testAi()}>
                  {aiTesting ? "Testing…" : "Test connection"}
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                Get a key at platform.deepseek.com. Used by the AI Test Generator; the key never leaves this device.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove profile photo?"
        message="Your initials will be shown instead."
        confirmLabel="Remove"
        danger
        loading={removeAvatar.isPending}
        onConfirm={() => removeAvatar.mutate()}
      />
    </>
  );
}
