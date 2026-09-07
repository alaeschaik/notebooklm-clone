"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Built on the native <dialog> element, which supplies focus trapping, Escape
 * handling, inertness of the page behind it and the top-layer backdrop — all
 * things a hand-rolled modal reimplements, usually incompletely.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click landing on the dialog element itself is a backdrop click,
        // because the content fills the padding box.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-fg shadow-lg",
        "backdrop:bg-black/35 backdrop:backdrop-blur-[2px]",
        "open:animate-fade-in",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              {description}
            </p>
          )}
        </div>
        <IconButton title="Close" size="icon-sm" onClick={onClose} className="-mr-1">
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="px-5 py-4">{children}</div>

      {footer && (
        <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
