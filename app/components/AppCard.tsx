import React from "react";

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  testid?: string;
}

export default function AppCard({ children, className, title, actions, testid }: AppCardProps) {
  return (
    <div
      className={"surface-raised flex flex-col gap-4 p-6 sm:p-8" + (className ? " " + className : "")}
      data-testid={testid || "app-card"}
    >
      {title && (
        <header className="flex flex-col gap-3">
          <h2 className="headline-lg">{title}</h2>
          <hr className="rule-dashed opacity-60" />
        </header>
      )}
      <div className="flex flex-col gap-4">{children}</div>
      {actions && (
        <>
          <hr className="rule-dashed opacity-60" />
          <div className="flex flex-wrap justify-end gap-3">{actions}</div>
        </>
      )}
    </div>
  );
}
