"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fmt$, fmtPct } from "@/lib/format";
import { BarChart3, Zap, Plus, Loader2, RefreshCw } from "lucide-react";

export default function ScreenPage() {
  const { toast } = useToast();
  const [screened, setScreened] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(true);
  const [addingTickers, setAddingTickers] = useState<Set<string>>(new Set());

  const loadPrevious = useCallback(async () => {
    setLoadingPrev(true);
    try {
      const res = await fetch("/api/screened");
      if (res.ok) setScreened(await res.json());
    } finally {
      setLoadingPrev(false);
    }
  }, []);

  useEffect(() => {
    loadPrevious();
  }, [loadPrevious]);

  async function runScreen() {
    setLoading(true);
    try {
      const res = await fetch("/api/screen", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScreened(data.stocks || []);
      toast({
        title: "Screen complete",
        description: `${data.count || 0} stocks analyzed`,
      });
    } catch (e: any) {
      toast({ title: "Screen failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function addToPortfolio(tickers: string[]) {
    const tickerSet = new Set(tickers);
    setAddingTickers(tickerSet);
    try {
      const res = await fetch("/api/portfolio/add-from-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, equalWeight: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: "Added to portfolio",
        description: `${data.added?.length || 0} stock(s) added with equal weights`,
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setAddingTickers(new Set());
    }
  }

  const top5 = screened.slice(0, 5);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Momentum Screen</h1>
            <p className="text-sm text-muted-foreground">
              Screens 100 large-cap stocks for momentum consistency + sector positioning
            </p>
          </div>
          <div className="flex gap-2">
            {screened.length > 0 && (
              <Button variant="outline" size="sm" onClick={loadPrevious} disabled={loadingPrev}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Reload
              </Button>
            )}
            <Button onClick={runScreen} disabled={loading} data-testid="btn-run-screen">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Screening...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" /> Run Screen
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium">Analyzing 100 stocks across all sectors...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fetching Yahoo Finance data, calculating momentum scores and sector alignment
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This typically takes 60–90 seconds
              </p>
            </CardContent>
          </Card>
        )}

        {screened.length > 0 && !loading && (
          <>
            {/* Top 5 Picks */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Top 5 Picks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {top5.map((s: any) => (
                    <div
                      key={s.ticker}
                      className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-1.5"
                    >
                      <span className="font-medium text-sm text-primary">{s.ticker}</span>
                      <span className="text-xs text-muted-foreground">{s.composite_score.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => addToPortfolio(top5.map((s: any) => s.ticker))}
                  disabled={addingTickers.size > 0}
                  data-testid="btn-add-top5"
                >
                  {addingTickers.size > 0 ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 mr-1" />
                  )}
                  Add Top 5 to Portfolio
                </Button>
              </CardContent>
            </Card>

            {/* Full Results */}
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Ticker</TableHead>
                    <TableHead className="text-xs">Sector</TableHead>
                    <TableHead className="text-xs text-right">Price</TableHead>
                    <TableHead className="text-xs text-right">1M</TableHead>
                    <TableHead className="text-xs text-right">3M</TableHead>
                    <TableHead className="text-xs text-right">6M</TableHead>
                    <TableHead className="text-xs text-right">12M</TableHead>
                    <TableHead className="text-xs text-right">Consistency</TableHead>
                    <TableHead className="text-xs text-right">Mom.</TableHead>
                    <TableHead className="text-xs text-right">Sector</TableHead>
                    <TableHead className="text-xs text-right">Composite</TableHead>
                    {screened.some((s: any) => s.sa_momentum_grade) && (
                      <TableHead className="text-xs text-right">SA Grade</TableHead>
                    )}
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {screened.slice(0, 30).map((s: any, i: number) => (
                    <TableRow
                      key={s.ticker}
                      className="border-border"
                      data-testid={`row-screen-${s.ticker}`}
                    >
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{s.ticker}</span>
                        <p className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {s.company_name}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {s.sector}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {fmt$(s.price)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-xs ${
                          s.return_1m >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {fmtPct(s.return_1m)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-xs ${
                          s.return_3m >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {fmtPct(s.return_3m)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-xs ${
                          s.return_6m >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {fmtPct(s.return_6m)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-xs ${
                          s.return_12m >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {fmtPct(s.return_12m)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {s.momentum_consistency.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {s.momentum_score.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {s.sector_score}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium text-sm tabular-nums ${
                            s.composite_score >= 70
                              ? "text-emerald-400"
                              : s.composite_score >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {s.composite_score.toFixed(1)}
                        </span>
                      </TableCell>
                      {screened.some((st: any) => st.sa_momentum_grade) && (
                        <TableCell className="text-right text-xs">
                          {s.sa_momentum_grade || "–"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addToPortfolio([s.ticker])}
                          disabled={addingTickers.has(s.ticker)}
                          data-testid={`btn-add-${s.ticker}`}
                        >
                          {addingTickers.has(s.ticker) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        {screened.length === 0 && !loading && !loadingPrev && (
          <Card>
            <CardContent className="py-14 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No screen results yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Run Screen" to analyze 100 large-cap stocks
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
