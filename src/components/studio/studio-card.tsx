import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * One shell for every studio feature. The panel is narrow and holds four
 * unrelated tools; without a shared frame they read as four different widgets
 * that happen to be stacked.
 */
export function StudioCard({
  icon,
  title,
  hint,
  actions,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface p-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          {icon}
        </span>
        <h3 className="truncate text-[13px] font-semibold tracking-tight">
          {title}
        </h3>
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>

      {hint && <p className="mt-1.5 text-xs leading-relaxed text-fg-subtle">{hint}</p>}
      {children}
    </section>
  );
}
