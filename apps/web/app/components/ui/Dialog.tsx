import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned actions */
  footer?: ReactNode;
  width?: number;
  "data-testid"?: string;
}

/** Centered modal for confirmations and short forms (reject reason, create task). Esc closes. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
  "data-testid": testId,
}: DialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open || !onClose) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        data-testid={testId}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex max-h-[90vh] w-full flex-col rounded-xl bg-raised shadow-xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start gap-3 pl-5 pr-[18px] pt-[18px]">
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="m-0 text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-fg">{title}</h2>
            {description ? <p className="m-0 text-[13px] leading-normal text-fg-secondary">{description}</p> : null}
          </div>
          {onClose ? <IconButton icon="x" label={t("common.close")} size="xs" onClick={onClose} /> : null}
        </div>
        {children ? (
          <div className="flex flex-col gap-3.5 overflow-y-auto px-5 py-4">{children}</div>
        ) : (
          <div className="h-4" />
        )}
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
