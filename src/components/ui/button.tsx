"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover active:translate-y-px",
        secondary:
          "border border-border bg-surface text-fg shadow-sm hover:border-border-strong hover:bg-surface-2 active:translate-y-px",
        subtle: "bg-surface-2 text-fg hover:bg-surface-3",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        danger: "bg-danger text-white shadow-sm hover:opacity-90",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-2.5 text-[13px]",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-4 text-sm",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(button({ variant, size }), className)} {...props} />
  );
}

/** A square, label-less button. `title` doubles as the accessible name. */
export function IconButton({
  className,
  variant = "ghost",
  size = "icon",
  title,
  ...props
}: ButtonProps & { title: string }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={cn(button({ variant, size }), className)}
      {...props}
    />
  );
}
