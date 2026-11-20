import { useEffect, useState } from "react";

export interface ToastProps {
  /** Message to show; a new value (or new `id`) shows it again */
  text: string | null | undefined;
  /** Change to re-show the same text (e.g. a submission counter) */
  id?: unknown;
  durationMs?: number;
  "data-testid"?: string;
}

/** Bottom-center confirmation ("Profile updated"), inverse surface, auto-hides. */
export function Toast({ text, id, durationMs = 4000, "data-testid": testId = "toast" }: ToastProps) {
  const [hiddenFor, setHiddenFor] = useState<unknown>(undefined);
  const key = id ?? text;

  useEffect(() => {
    if (!text) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setHiddenFor(key);
    }, durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [text, key, durationMs]);

  if (!text || hiddenFor === key) {
    return null;
  }
  return (
    <div
      role="status"
      data-testid={testId}
      className="fixed bottom-16 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-inverse px-3.5 py-2.5 text-[12.5px] font-medium leading-none text-fg-inverse shadow-lg"
    >
      {text}
    </div>
  );
}
