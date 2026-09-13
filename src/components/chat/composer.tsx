"use client";

import { ArrowUp, Square } from "lucide-react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";

export type ComposerHandle = { fill: (question: string) => void };

export function Composer({
  disabled,
  streaming,
  warning,
  onSend,
  onStop,
  ref,
}: {
  disabled: boolean;
  streaming: boolean;
  warning?: string;
  onSend: (question: string) => void;
  onStop: () => void;
  ref?: Ref<ComposerHandle>;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !disabled && !streaming;

  useImperativeHandle(ref, () => ({
    fill: (question: string) => {
      setValue(question);
      inputRef.current?.focus();
    },
  }), []);

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
      <div className="mx-auto max-w-[46rem]">
        {warning && <p className="mb-2 text-xs text-warning">{warning}</p>}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-sm transition-colors focus-within:border-accent"
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              // Grow with the content, up to a cap.
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 176)}px`;
            }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter adds a line — the convention every
              // other chat input has already taught people.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t.chat.placeholder}
            rows={1}
            disabled={disabled}
            className="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-fg-subtle disabled:opacity-50"
          />

          {streaming ? (
            <IconButton
              type="button"
              title={t.chat.stop}
              variant="subtle"
              onClick={onStop}
              className="shrink-0 rounded-lg"
            >
              <Square className="size-3 fill-current" />
            </IconButton>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t.chat.send}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                canSend
                  ? "bg-accent text-accent-fg hover:bg-accent-hover"
                  : "bg-surface-2 text-fg-subtle",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
