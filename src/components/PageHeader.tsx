import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur safe-top">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {back && (
          <button
            onClick={() => (typeof back === "string" ? nav(back) : nav(-1))}
            className="-ml-2 grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}
