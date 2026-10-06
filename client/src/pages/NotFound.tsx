import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="h-10 w-10" />}
      title="Page not found"
      hint="The page you're looking for doesn't exist or was moved."
      action={
        <Link
          to="/"
          className="inline-flex h-8 items-center rounded-lg border border-ink-300 bg-white px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          Back to dashboard
        </Link>
      }
    />
  );
}
