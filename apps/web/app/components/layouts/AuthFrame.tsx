import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { PRODUCT_INITIALS } from "../ui/brand";

export interface AuthFrameProps {
  children: ReactNode;
}

/** Centered auth card: product mark above, language switch below (login, SSO errors, invite). */
export function AuthFrame({ children }: AuthFrameProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-app p-6">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-inverse text-[11px] font-semibold leading-none text-fg-inverse">
          {PRODUCT_INITIALS}
        </span>
        <span className="text-[15px] font-semibold leading-none tracking-[-0.015em] text-fg">{t("auth.title")}</span>
      </div>
      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-xl border border-line bg-surface p-7 shadow-sm">
        {children}
      </div>
      <LanguageSwitcher variant="full" />
    </div>
  );
}

export interface AuthHeadingProps {
  title: ReactNode;
  description?: ReactNode;
}

/** 20px title + one-line description at the top of an auth card. */
export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[20px] font-semibold leading-[1.2] tracking-[-0.02em] text-fg">{title}</h1>
      {description ? <p className="m-0 text-[13px] leading-normal text-fg-secondary">{description}</p> : null}
    </div>
  );
}
