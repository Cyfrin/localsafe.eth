import React from "react";

interface AppSectionProps {
  children: React.ReactNode;
  className?: string;
  testid?: string;
}

export default function AppSection({ children, className, testid }: AppSectionProps) {
  return (
    <section
      className={
        "container mx-auto flex w-full flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12" + (className ? " " + className : "")
      }
      data-testid={testid || "app-section"}
    >
      {children}
    </section>
  );
}
