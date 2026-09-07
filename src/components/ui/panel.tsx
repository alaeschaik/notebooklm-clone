import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The three columns share one header height and one body treatment. Letting
 * each panel size its own header is what makes a multi-pane layout look
 * assembled from parts rather than designed.
 */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col bg-surface", className)}>
      {title !== undefined && (
        <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border px-3">
          <h2 className="truncate text-[13px] font-semibold tracking-tight">
            {title}
          </h2>
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
          {icon}
        </div>
      )}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-[26ch] text-xs leading-relaxed text-fg-subtle">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse-soft rounded-md bg-surface-2", className)}
    />
  );
}
