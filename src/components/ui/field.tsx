import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const base =
  "w-full rounded-md border border-border bg-surface text-sm text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-9 px-3", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(base, "resize-y p-3 leading-relaxed", className)} {...props} />
  );
}
