"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt$, fmtNum, fmtDateTime } from "@/lib/format";
import {
  Loader2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trades");
      if (res.ok) setTrades(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Trade History</h1>
          <p className="text-sm text-muted-foreground">
            All executed and pending orders
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : trades.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <RefreshCw className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No trades yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trades will appear here after rebalancing
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Ticker</TableHead>
                  <TableHead className="text-xs">Side</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((t: any) => (
                  <TableRow
                    key={t.id}
                    className="border-border"
                    data-testid={`row-trade-${t.id}`}
                  >
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {fmtDateTime(t.created_at)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{t.ticker}</TableCell>
                    <TableCell>
                      <Badge
                        variant={t.side === "buy" ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {t.side === "buy" ? (
                          <ArrowUpRight className="w-3 h-3 mr-0.5" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 mr-0.5" />
                        )}
                        {t.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {t.qty > 0 ? fmtNum(t.qty) : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt$(t.total_value)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {t.reason}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          t.status === "filled"
                            ? "text-emerald-400 border-emerald-500/20"
                            : t.status === "failed"
                            ? "text-red-400 border-red-500/20"
                            : "text-amber-400 border-amber-500/20"
                        }
                      >
                        {t.status === "filled" ? (
                          <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        ) : t.status === "failed" ? (
                          <XCircle className="w-3 h-3 mr-0.5" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                        )}
                        {t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
