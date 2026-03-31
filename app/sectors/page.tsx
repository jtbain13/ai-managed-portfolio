"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, TrendingDown, Activity } from "lucide-react";

export default function SectorsPage() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sectors");
      if (res.ok) setSectors(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Sector Outlook</h1>
          <p className="text-sm text-muted-foreground">
            Macro and geopolitical positioning scores influencing stock selection
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sectors.map((s: any) => {
              let trends: string[] = [];
              try {
                trends = Array.isArray(s.key_trends)
                  ? s.key_trends
                  : JSON.parse(s.key_trends || "[]");
              } catch {}

              const scoreColor =
                s.score >= 60
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : s.score >= 40
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20";

              const ScoreIcon =
                s.score >= 60 ? TrendingUp : s.score >= 40 ? Activity : TrendingDown;

              return (
                <Card
                  key={s.id || s.sector}
                  data-testid={`card-sector-${s.sector}`}
                >
                  <CardContent className="pt-4 pb-4 px-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">{s.sector}</h3>
                      <Badge variant="secondary" className={scoreColor}>
                        <ScoreIcon className="w-3 h-3 mr-1" />
                        {s.score}/100
                      </Badge>
                    </div>
                    <Progress value={s.score} className="h-1.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {s.rationale}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {trends.map((t: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
