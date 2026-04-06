"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove("dark");
      setIsDark(false);
    } else {
      root.classList.add("dark");
      setIsDark(true);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-full justify-start gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      data-testid="btn-theme-toggle"
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 shrink-0" />
          Light Mode
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 shrink-0" />
          Dark Mode
        </>
      )}
    </Button>
  );
}
