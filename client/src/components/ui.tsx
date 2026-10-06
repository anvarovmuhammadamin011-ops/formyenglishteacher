import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ───────────────────────── Button ───────────────────────── */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
        secondary: "bg-ink-800 text-white hover:bg-ink-900 shadow-sm",
        outline: "border border-ink-300 bg-white text-ink-700 hover:bg-ink-50",
        ghost: "text-ink-600 hover:bg-ink-200/60 hover:text-ink-900",
        danger: "bg-danger-600 text-white hover:bg-danger-500 shadow-sm",
        success: "bg-success-600 text-white hover:bg-success-500 shadow-sm",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-sm",
        icon: "h-9 w-9",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* ───────────────────────── Form ───────────────────────── */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-lg border border-ink-300 bg-white px-3 py-1 text-sm text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full appearance-none rounded-lg border border-ink-300 bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat px-3 pr-8 text-sm text-ink-900 shadow-sm transition-colors focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink-700", className)} {...props} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}

/* ───────────────────────── Card ───────────────────────── */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-ink-200 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-ink-900", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-ink-500", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

/* ───────────────────────── Badge ───────────────────────── */

const badgeTones: Record<string, string> = {
  default: "bg-brand-50 text-brand-700 ring-brand-600/20",
  gray: "bg-ink-100 text-ink-600 ring-ink-500/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function Badge({ tone = "gray", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ───────────────────────── Table ───────────────────────── */

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-ink-200 bg-ink-50/70", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-ink-100", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-ink-50/60", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-9 px-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-ink-700", className)} {...props} />;
}

/* ───────────────────────── Modal ───────────────────────── */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-ink-200 bg-white p-0 shadow-2xl focus:outline-none data-[state=open]:animate-fade-in",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-ink-900">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-ink-500">{description}</DialogPrimitive.Description>
              )}
              {!description && <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "default"} size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{message}</p>
    </Modal>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; badge?: number }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-ink-200", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
            value === t.value
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800",
          )}
        >
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="ml-1.5 rounded-full bg-ink-200 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Misc ───────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600", className)} />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-ink-500">
      <Spinner /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink-200", className)} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 px-6 py-12 text-center">
      {icon && <div className="text-ink-400">{icon}</div>}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "green" | "amber" | "red" | "ink";
  sub?: ReactNode;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    ink: "bg-ink-100 text-ink-600",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold text-ink-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
        </div>
        {icon && <div className={cn("rounded-lg p-2", tones[tone ?? "ink"])}>{icon}</div>}
      </div>
    </Card>
  );
}

const progressTones: Record<string, string> = {
  brand: "bg-brand-500",
  green: "bg-success-500",
  amber: "bg-warning-500",
  red: "bg-danger-500",
  ink: "bg-ink-400",
};

export function ProgressBar({ value, className, tone }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-200", className)}>
      <div
        className={cn("h-full rounded-full transition-all", progressTones[tone ?? ""] ?? tone ?? "bg-brand-500")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Avatar({
  src,
  firstName,
  lastName,
  size = "md",
  className,
}: {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={cn("rounded-full object-cover ring-1 ring-ink-200", dims, className)} />;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-1 ring-brand-200",
        dims,
        className,
      )}
    >
      {initials(firstName, lastName)}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
