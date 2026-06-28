"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading } = trpc.auth.session.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const isPublicAuthPath = pathname === "/login" || pathname === "/setup";

  useEffect(() => {
    if (isLoading) return;
    if (!data?.initialized && pathname !== "/setup") {
      router.replace("/setup");
    } else if (data?.initialized && !data?.authed && pathname !== "/login") {
      router.replace("/login");
    } else if (data?.initialized && data?.authed && (pathname === "/login" || pathname === "/setup")) {
      router.replace("/");
    }
  }, [data, isLoading, router, pathname]);

  if (isLoading && isPublicAuthPath) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="auth-screen flex h-screen items-center justify-center" data-motion="section">
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm" data-motion="card">
          加载中...
        </div>
      </div>
    );
  }

  if (!data?.initialized && pathname !== "/setup") return null;
  if (data?.initialized && !data?.authed && pathname !== "/login") return null;
  if (data?.initialized && data?.authed && (pathname === "/login" || pathname === "/setup")) return null;

  return <>{children}</>;
}
