"use client";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="S2A Manager"
      className={cn("size-10", className)}
      data-motion="brand"
      data-motion-hover="scale"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="6" width="52" height="52" rx="15" fill="currentColor" fillOpacity="0.04" />
      <rect x="6.5" y="6.5" width="51" height="51" rx="14.5" stroke="currentColor" strokeOpacity="0.18" />
      <path
        d="M19 24.5C19 20.9 22.1 18 26.6 18H43"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M45 39.5C45 43.1 41.9 46 37.4 46H21"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M23 32H41"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M38.5 25.5L45 32L38.5 38.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
