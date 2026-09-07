"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
};

const ConfirmContext = createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

/**
 * Replaces `window.confirm`, which cannot be styled, ignores the app's
 * language, and renders as an OS chrome dialog that looks nothing like the
 * product around it.
 *
 * The promise-based API keeps call sites as short as the native call was:
 * `if (!(await confirm({...}))) return;`
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        description={options?.message}
        className="w-[min(26rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button size="sm" onClick={() => settle(false)}>
              {options?.cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={options?.destructive ? "danger" : "primary"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
