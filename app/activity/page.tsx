"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";
import { Loader2, Clock } from "lucide-react";

function typeColor(type: string) {
  switch (type) {
    case "trade": return "bg-blue-400";
    case "screen": return "bg-emerald-400";
    case "rebalance": return "bg-amber-400";
    case "error": return "bg-red-400";
    default: return "bg-muted-foreground";
  }
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity");
      if (res.ok) setActivity(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Activity Log</h1>
          <p className="text-sm text-muted-foreground">
            System events, trades, and screens
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activity.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {activity.slice(0, 100).map((a: any) => (
                  <div
                    key={a.id}
                    className="px-4 py-3 flex items-start gap-3"
                    data-testid={`row-activity-${a.id}`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${typeColor(a.type)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.message}</p>
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        {fmtDateTime(a.created_at)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {a.type}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
