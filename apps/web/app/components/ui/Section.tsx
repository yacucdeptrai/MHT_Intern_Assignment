import type { ReactNode } from "react";

export interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
}

/** Settings row: 240px title/description column, then the controls; hairline below. */
export function Section({ title, description, children, "data-testid": testId }: SectionProps) {
  return (
    <section
      data-testid={testId}
      className="grid gap-8 border-b border-line py-6"
      style={{ gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)" }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[13.5px] font-semibold leading-[1.3] text-fg">{title}</h2>
        {description ? <p className="m-0 text-[12.5px] leading-[1.45] text-fg-muted">{description}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">{children}</div>
    </section>
  );
}
