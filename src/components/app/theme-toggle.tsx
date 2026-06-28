"use client";

import { useEffect, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? (theme === "system" ? resolvedTheme : theme) : "light";
  const isDark = activeTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={mounted ? (isDark ? "切换到亮色模式" : "切换到暗色模式") : "切换主题"}
      aria-label={mounted ? (isDark ? "切换到亮色模式" : "切换到暗色模式") : "切换主题"}
    >
      {mounted && isDark ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
    </Button>
  );
}
