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
import { fmt$, fmtPct, fmtDate } from "@/lib/format";
import {
  RotateCcw,
  Zap,
  Target,
  DollarSign,
  Loader2,
  Trash2,
  Search,
  TrendingUp,
  TrendingDown,
  Shield,
} from "lucide-react";

export default function DashboardPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [rebalancing, setRebalancing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const [summaryRes, settingsRes] = await Promise.all([
        fetch("/api/portfolio/summary"),
        fetch("/api/settings"),
      ]);
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
        setHoldings(data.holdings || []);
      }
      if (settingsRes.ok) {
        setSettings(await settingsRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleRebalance() {
    setRebalancing(true);
    try {
      const res = await fetch("/api/rebalance", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: "Rebalanced",
        description: `${data.orders?.length || 0} orders executed`,
      });
      fetchData();
    } catch (e: any) {
      toast({ title: "Rebalance failed", description: e.message, variant: "destructive" });
    } finally {
      setRebalancing(false);
    }
  }

  async function handleDelete(id: string, ticker: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Removed", description: `${ticker} removed from portfolio` });
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const totalValue = summary?.totalValue || 0;
  const totalGL = summary?.totalGainLoss || 0;
  const totalGLPct = summary?.totalGainLossPercent || 0;
  const isModel = summary?.isModelPortfolio ?? true;

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {isModel ? "Model portfolio — hypothetical performance" : "Live portfolio"}
            </p>
          </div>
          <div className="flex gap-2">
            {settings?.is_paper_trading !== false && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                <Shield className="w-3 h-3 mr-1" />
                Paper Trading
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loadingSummary}
            >
              {loadingSummary ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleRebalance}
              disabled={rebalancing || holdings.length === 0}
              data-testid="btn-rebalance"
            >
              {rebalancing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1" />
              )}
              Rebalance
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Portfolio Value</p>
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <p className="text-xl font-semibold tabular-nums" data-testid="text-portfolio-value">
                  {loadingSummary ? "..." : fmt$(totalValue)}
                </p>
                {isModel && (
                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30 mb-0.5">
                    Model
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Total P&L</p>
                {totalGL >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                )}
              </div>
              <p
                className={`text-xl font-semibold tabular-nums ${
                  totalGL >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
                data-testid="text-pnl"
              >
                {loadingSummary
                  ? "..."
                  : `${fmt$(totalGL)} (${fmtPct(totalGLPct)})`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Positions</p>
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-semibold tabular-nums" data-testid="text-positions">
                {holdings.length} <span className="text-sm text-muted-foreground font-normal">/ 5</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Last Rebalance</p>
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium tabular-nums" data-testid="text-last-rebalance">
                {settings?.last_rebalance
                  ? fmtDate(settings.last_rebalance)
                  : "Never"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Holdings Table */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Holdings
          </h2>

          {holdings.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">No positions yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Run a momentum screen to find top stocks
                </p>
                <Button size="sm" asChild>
                  <a href="/screen">
                    <Search className="w-3.5 h-3.5 mr-1" /> Run Screen
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="text-xs">Ticker</TableHead>
                    <TableHead className="text-xs">Sector</TableHead>
                    <TableHead className="text-xs text-right">Price</TableHead>
                    <TableHead className="text-xs text-right">Target %</TableHead>
                    <TableHead className="text-xs text-right">Current %</TableHead>
                    <TableHead className="text-xs text-right">Drift</TableHead>
                    <TableHead className="text-xs text-right">Market Value</TableHead>
                    <TableHead className="text-xs text-right">P&L</TableHead>
                    <TableHead className="text-xs text-right">Score</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((h: any) => {
                    const drift = (h.current_weight || 0) - (h.target_weight || 0);
                    const gl = h.gain_loss_percent || 0;
                    return (
                      <TableRow
                        key={h.id}
                        className="border-border"
                        data-testid={`row-holding-${h.ticker}`}
                      >
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{h.ticker}</span>
                            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                              {h.company_name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {h.sector}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {fmt$(h.current_price || 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {h.target_weight}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {(h.current_weight || 0).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-xs tabular-nums ${
                              Math.abs(drift) > 5
                                ? "text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {drift >= 0 ? "+" : ""}
                            {drift.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {fmt$(h.market_value || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-sm tabular-nums ${
                              gl >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {fmtPct(gl)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {(h.composite_score || 0).toFixed(0)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(h.id, h.ticker)}
                            disabled={deletingId === h.id}
                            data-testid={`btn-remove-${h.ticker}`}
                          >
                            {deletingId === h.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        {/* Weight Distribution */}
        {holdings.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Weight Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {holdings.map((h: any) => (
                <div key={h.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{h.ticker}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {h.target_weight}% target &bull; {(h.current_weight || 0).toFixed(1)}% actual
                    </span>
                  </div>
                  <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/30 rounded-full"
                      style={{ width: `${Math.min(h.target_weight, 100)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-primary rounded-full"
                      style={{ width: `${Math.min(h.current_weight || 0, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
