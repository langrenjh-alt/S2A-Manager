"use client";

import { ExternalLink, Github, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

const projectUrl = "https://github.com/langrenjh-alt/S2A-Manager";
const relayUrl = "https://z30.top";

type ProjectPromoLinksProps = {
  className?: string;
  stacked?: boolean;
};

export function ProjectPromoLinks({ className, stacked = false }: ProjectPromoLinksProps) {
  const linkClass = cn(
    "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-secondary hover:text-foreground",
    stacked ? "w-full" : "max-w-full",
  );

  return (
    <div className={cn(stacked ? "space-y-2" : "flex flex-wrap items-center gap-2", className)}>
      <a href={projectUrl} target="_blank" rel="noreferrer" className={linkClass} title="打开 S2A Manager GitHub 仓库" data-motion="control" data-motion-hover="lift">
        <Github className="size-3.5 shrink-0" />
        <span className="truncate">GitHub: langrenjh-alt/S2A-Manager</span>
        <ExternalLink className="size-3 shrink-0 opacity-70" />
      </a>
      <a href={relayUrl} target="_blank" rel="noreferrer" className={linkClass} title="访问 SUB2API 中转站 z30.top" data-motion="control" data-motion-hover="lift">
        <Globe2 className="size-3.5 shrink-0" />
        <span className="truncate">SUB2API 中转站：z30.top</span>
        <ExternalLink className="size-3 shrink-0 opacity-70" />
      </a>
    </div>
  );
}
