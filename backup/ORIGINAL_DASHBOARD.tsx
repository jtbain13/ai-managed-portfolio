import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, Activity, Settings, BarChart3,
  RefreshCw, Zap, Shield, DollarSign, Target, Clock,
  ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Plus, Trash2, Search, RotateCcw
} from "lucide-react";

// Helpers
function fmt$(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
function fmtPct(val: number) {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}
function fmtNum(val: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(val);
}

export default function Dashboard() {
  const { toast } = useToast();
  const [tab, setTab] = useState("portfolio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectForm, setConnectForm] = useState({ apiKey: "", secretKey: "", isPaper: true });
  const [rapidApiKey, setRapidApiKey] = useState("");
  const [modelValue, setModelValue] = useState("10000");

  // Queries
  const { data: settings } = useQuery({ queryKey: ["/api/settings"] });
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({ queryKey: ["/api/holdings"] });
  const { data: tradesData } = useQuery({ queryKey: ["/api/trades"] });
  const { data: screenedData } = useQuery({ queryKey: ["/api/screened"] });
  const { data: sectorsData } = useQuery({ queryKey: ["/api/sectors"] });
  const { data: activityData } = useQuery({ queryKey: ["/api/activity"] });
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/portfolio/summary"],
    refetchInterval: 60000,
  });

  const holdings = (holdingsData as any[]) || [];
  const trades = (tradesData as any[]) || [];
  const screened = (screenedData as any[]) || [];
  const sectors = (sectorsData as any[]) || [];
  const activity = (activityData as any[]) || [];
  const summary = summaryData as any;

  // Mutations
  const screenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/screen");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/screened"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Screen complete", description: `${data.count || 0} stocks analyzed` });
    },
    onError: (err: any) => toast({ title: "Screen failed", description: err.message, variant: "destructive" }),
  });

  const connectMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/alpaca/connect", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Connected", description: `Alpaca account connected. Value: ${fmt$(parseFloat(data.portfolioValue))}` });
    },
    onError: (err: any) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const rebalanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rebalance");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      toast({ title: "Rebalanced", description: `${data.orders?.length || 0} orders executed` });
    },
    onError: (err: any) => toast({ title: "Rebalance failed", description: err.message, variant: "destructive" }),
  });

  const addFromScreenMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await apiRequest("POST", "/api/portfolio/add-from-screen", { tickers, equalWeight: true });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Added to portfolio", description: "Stocks added with equal weights" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/holdings/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
  });

  const saveRapidApiMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("PATCH", "/api/settings", { rapidApiKey: key });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Saved", description: "RapidAPI key saved for Seeking Alpha data" });
    },
  });

  const setPortfolioValueMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await apiRequest("POST", "/api/portfolio/set-value", { value });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Updated", description: "Model portfolio value updated" });
    },
  });

  const totalValue = summary?.totalValue || 0;
  const totalGL = summary?.totalGainLoss || 0;
  const totalGLPct = summary?.totalGainLossPercent || 0;
  const isModelPortfolio = summary?.isModelPortfolio ?? true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between" data-testid="header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Momentum Portfolio</h1>
            <p className="text-xs text-muted-foreground">AI-Managed Model Portfolio</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {settings?.isPaperTrading !== false && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
              <Shield className="w-3 h-3 mr-1" />
              Paper Trading
            </Badge>
          )}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="btn-settings">
                <Settings className="w-4 h-4 mr-1" /> Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-card">
              <DialogHeader>
                <DialogTitle>Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {/* Alpaca Connection */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" /> Alpaca Trading
                  </h3>
                  <Input
                    placeholder="API Key"
                    value={connectForm.apiKey}
                    onChange={e => setConnectForm(p => ({ ...p, apiKey: e.target.value }))}
                    data-testid="input-alpaca-key"
                  />
                  <Input
                    placeholder="Secret Key"
                    type="password"
                    value={connectForm.secretKey}
                    onChange={e => setConnectForm(p => ({ ...p, secretKey: e.target.value }))}
                    data-testid="input-alpaca-secret"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={connectForm.isPaper}
                      onCheckedChange={v => setConnectForm(p => ({ ...p, isPaper: v }))}
                      data-testid="switch-paper"
                    />
                    <Label className="text-sm">Paper Trading Mode</Label>
                  </div>
                  <Button
                    onClick={() => connectMutation.mutate(connectForm)}
                    disabled={connectMutation.isPending || !connectForm.apiKey}
                    className="w-full"
                    data-testid="btn-connect-alpaca"
                  >
                    {connectMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Connect Alpaca
                  </Button>
                </div>
                {/* Model Portfolio Value */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Model Portfolio Value
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Set the hypothetical capital for your model portfolio. Weights and market values will be calculated from this amount.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="10000"
                      value={modelValue}
                      onChange={e => setModelValue(e.target.value)}
                      data-testid="input-model-value"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => setPortfolioValueMutation.mutate(parseFloat(modelValue))}
                      disabled={!modelValue || parseFloat(modelValue) <= 0}
                      data-testid="btn-set-value"
                    >
                      Set
                    </Button>
                  </div>
                </div>
                {/* Seeking Alpha / RapidAPI */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Search className="w-4 h-4 text-primary" /> Seeking Alpha (via RapidAPI)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Optional: Add a RapidAPI key to enrich screens with Seeking Alpha quant ratings and momentum grades.
                    Free tier: 400 req/mo. Subscribe at rapidapi.com.
                  </p>
                  <Input
                    placeholder="RapidAPI Key"
                    value={rapidApiKey}
                    onChange={e => setRapidApiKey(e.target.value)}
                    data-testid="input-rapid-key"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => saveRapidApiMutation.mutate(rapidApiKey)}
                    disabled={!rapidApiKey}
                    className="w-full"
                    data-testid="btn-save-rapid"
                  >
                    Save RapidAPI Key
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-6 max-w-[1440px] mx-auto space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-card-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground mb-1">Portfolio Value</p>
                {isModelPortfolio && <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">Model</Badge>}
              </div>
              <p className="text-xl font-semibold tabular-nums" data-testid="text-portfolio-value">
                {summaryLoading ? "..." : fmt$(totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-card-border">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
              <p className={`text-xl font-semibold tabular-nums ${totalGL >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-pnl">
                {summaryLoading ? "..." : `${fmt$(totalGL)} (${fmtPct(totalGLPct)})`}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-card-border">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Positions</p>
              <p className="text-xl font-semibold tabular-nums" data-testid="text-positions">
                {holdings.length} / 5
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-card-border">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Last Rebalance</p>
              <p className="text-sm font-medium tabular-nums" data-testid="text-last-rebalance">
                {settings?.lastRebalance
                  ? new Date(settings.lastRebalance).toLocaleDateString()
                  : "Never"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted">
            <TabsTrigger value="portfolio" data-testid="tab-portfolio">
              <Target className="w-3.5 h-3.5 mr-1.5" /> Portfolio
            </TabsTrigger>
            <TabsTrigger value="screen" data-testid="tab-screen">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Screen
            </TabsTrigger>
            <TabsTrigger value="sectors" data-testid="tab-sectors">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Sectors
            </TabsTrigger>
            <TabsTrigger value="trades" data-testid="tab-trades">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Trades
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Clock className="w-3.5 h-3.5 mr-1.5" /> Activity
            </TabsTrigger>
          </TabsList>

          {/* PORTFOLIO TAB */}
          <TabsContent value="portfolio" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Model Portfolio Holdings</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] })}
                  data-testid="btn-refresh-prices"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Refresh Prices
                </Button>
                <Button
                  size="sm"
                  onClick={() => rebalanceMutation.mutate()}
                  disabled={rebalanceMutation.isPending || holdings.length === 0}
                  data-testid="btn-rebalance"
                >
                  {rebalanceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                  Rebalance Now
                </Button>
              </div>
            </div>

            {holdings.length === 0 ? (
              <Card className="bg-card border-card-border">
                <CardContent className="py-12 text-center">
                  <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">No positions yet</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Run a momentum screen to find top stocks, then add them here.
                  </p>
                  <Button size="sm" onClick={() => setTab("screen")} data-testid="btn-go-screen">
                    <Search className="w-3.5 h-3.5 mr-1" /> Run Screen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-card-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-card-border hover:bg-transparent">
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
                      const drift = (h.currentWeight || 0) - h.targetWeight;
                      return (
                        <TableRow key={h.id} className="border-card-border" data-testid={`row-holding-${h.ticker}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{h.ticker}</span>
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">{h.companyName}</p>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{h.sector}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmt$(h.currentPrice || 0)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{h.targetWeight}%</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{(h.currentWeight || 0).toFixed(1)}%</TableCell>
                          <TableCell className="text-right">
                            <span className={`text-xs tabular-nums ${Math.abs(drift) > 5 ? "text-amber-400" : "text-muted-foreground"}`}>
                              {drift >= 0 ? "+" : ""}{drift.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmt$(h.marketValue || 0)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`text-sm tabular-nums ${(h.gainLossPercent || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {fmtPct(h.gainLossPercent || 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{(h.compositeScore || 0).toFixed(0)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteHoldingMutation.mutate(h.id)}
                              data-testid={`btn-remove-${h.ticker}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}

            {/* Weight Distribution */}
            {holdings.length > 0 && (
              <Card className="bg-card border-card-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Weight Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {holdings.map((h: any) => (
                    <div key={h.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{h.ticker}</span>
                        <span className="tabular-nums">{h.targetWeight}% target / {(h.currentWeight || 0).toFixed(1)}% actual</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div
                          className="bg-primary/40 rounded-sm"
                          style={{ width: `${h.targetWeight}%` }}
                        />
                        <div
                          className="bg-primary rounded-sm"
                          style={{ width: `${h.currentWeight || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* SCREEN TAB */}
          <TabsContent value="screen" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium">Momentum Screen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Screens 100 large-cap stocks for momentum consistency over 1 year + sector positioning
                </p>
              </div>
              <Button
                onClick={() => screenMutation.mutate()}
                disabled={screenMutation.isPending}
                data-testid="btn-run-screen"
              >
                {screenMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Screening...</>
                ) : (
                  <><BarChart3 className="w-4 h-4 mr-2" /> Run Screen</>
                )}
              </Button>
            </div>

            {screenMutation.isPending && (
              <Card className="bg-card border-card-border">
                <CardContent className="py-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm">Analyzing 100 stocks across all sectors...</p>
                  <p className="text-xs text-muted-foreground mt-1">Calculating momentum scores, consistency, and sector alignment</p>
                </CardContent>
              </Card>
            )}

            {screened.length > 0 && !screenMutation.isPending && (
              <>
                {/* Top 5 Recommendation */}
                <Card className="bg-card border-primary/20 border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" /> Top 5 Picks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {screened.slice(0, 5).map((s: any) => (
                        <Badge key={s.ticker} className="bg-primary/10 text-primary border-primary/20">
                          {s.ticker} <span className="ml-1 opacity-70">{s.compositeScore.toFixed(0)}</span>
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addFromScreenMutation.mutate(screened.slice(0, 5).map((s: any) => s.ticker))}
                      disabled={addFromScreenMutation.isPending}
                      data-testid="btn-add-top5"
                    >
                      {addFromScreenMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                      Add Top 5 to Portfolio
                    </Button>
                  </CardContent>
                </Card>

                {/* Full Screen Results Table */}
                <Card className="bg-card border-card-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-card-border hover:bg-transparent">
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Ticker</TableHead>
                        <TableHead className="text-xs">Sector</TableHead>
                        <TableHead className="text-xs text-right">Price</TableHead>
                        <TableHead className="text-xs text-right">1M</TableHead>
                        <TableHead className="text-xs text-right">3M</TableHead>
                        <TableHead className="text-xs text-right">6M</TableHead>
                        <TableHead className="text-xs text-right">12M</TableHead>
                        <TableHead className="text-xs text-right">Consistency</TableHead>
                        <TableHead className="text-xs text-right">Mom. Score</TableHead>
                        <TableHead className="text-xs text-right">Sector</TableHead>
                        <TableHead className="text-xs text-right">Composite</TableHead>
                        {screened.some((s: any) => s.saMomentumGrade) && (
                          <TableHead className="text-xs text-right">SA Grade</TableHead>
                        )}
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {screened.slice(0, 30).map((s: any, i: number) => (
                        <TableRow key={s.ticker} className="border-card-border" data-testid={`row-screen-${s.ticker}`}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <span className="font-medium text-sm">{s.ticker}</span>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{s.companyName}</p>
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{s.sector}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmt$(s.price)}</TableCell>
                          <TableCell className={`text-right tabular-nums text-xs ${s.return1m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPct(s.return1m)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-xs ${s.return3m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPct(s.return3m)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-xs ${s.return6m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPct(s.return6m)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-xs ${s.return12m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPct(s.return12m)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.momentumConsistency.toFixed(0)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.momentumScore.toFixed(1)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{s.sectorScore}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium text-sm tabular-nums ${s.compositeScore >= 70 ? "text-emerald-400" : s.compositeScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                              {s.compositeScore.toFixed(1)}
                            </span>
                          </TableCell>
                          {screened.some((s: any) => s.saMomentumGrade) && (
                            <TableCell className="text-right text-xs">{s.saMomentumGrade || "-"}</TableCell>
                          )}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => addFromScreenMutation.mutate([s.ticker])}
                              data-testid={`btn-add-${s.ticker}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </TabsContent>

          {/* SECTORS TAB */}
          <TabsContent value="sectors" className="space-y-4">
            <div>
              <h2 className="text-base font-medium">Sector Outlook</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Macro and geopolitical positioning scores influencing stock selection
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sectors.map((s: any) => {
                let trends: string[] = [];
                try { trends = JSON.parse(s.keyTrends || "[]"); } catch {}
                return (
                  <Card key={s.id} className="bg-card border-card-border" data-testid={`card-sector-${s.sector}`}>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium">{s.sector}</h3>
                        <Badge
                          variant="secondary"
                          className={
                            s.score >= 60 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            s.score >= 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-red-500/10 text-red-400 border-red-500/20"
                          }
                        >
                          {s.score >= 60 ? <TrendingUp className="w-3 h-3 mr-1" /> :
                           s.score >= 40 ? <Activity className="w-3 h-3 mr-1" /> :
                           <TrendingDown className="w-3 h-3 mr-1" />}
                          {s.score}/100
                        </Badge>
                      </div>
                      <Progress value={s.score} className="h-1.5 mb-2" />
                      <p className="text-xs text-muted-foreground mb-2">{s.rationale}</p>
                      <div className="flex flex-wrap gap-1">
                        {trends.map((t: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* TRADES TAB */}
          <TabsContent value="trades" className="space-y-4">
            <h2 className="text-base font-medium">Trade History</h2>
            {trades.length === 0 ? (
              <Card className="bg-card border-card-border">
                <CardContent className="py-8 text-center">
                  <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No trades yet</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-card-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-card-border hover:bg-transparent">
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
                      <TableRow key={t.id} className="border-card-border" data-testid={`row-trade-${t.id}`}>
                        <TableCell className="text-xs tabular-nums">{new Date(t.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="font-medium text-sm">{t.ticker}</TableCell>
                        <TableCell>
                          <Badge variant={t.side === "buy" ? "default" : "destructive"} className="text-xs">
                            {t.side === "buy" ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                            {t.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{t.qty > 0 ? fmtNum(t.qty) : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmt$(t.totalValue)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.reason}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            t.status === "filled" ? "text-emerald-400 border-emerald-500/20" :
                            t.status === "failed" ? "text-red-400 border-red-500/20" :
                            "text-amber-400 border-amber-500/20"
                          }>
                            {t.status === "filled" ? <CheckCircle2 className="w-3 h-3 mr-0.5" /> :
                             t.status === "failed" ? <XCircle className="w-3 h-3 mr-0.5" /> :
                             <AlertTriangle className="w-3 h-3 mr-0.5" />}
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity" className="space-y-4">
            <h2 className="text-base font-medium">Activity Log</h2>
            <Card className="bg-card border-card-border">
              <CardContent className="p-0">
                <div className="divide-y divide-card-border">
                  {activity.length === 0 ? (
                    <div className="py-8 text-center">
                      <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                    </div>
                  ) : (
                    activity.slice(0, 50).map((a: any) => (
                      <div key={a.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-activity-${a.id}`}>
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          a.type === "trade" ? "bg-blue-400" :
                          a.type === "screen" ? "bg-primary" :
                          a.type === "rebalance" ? "bg-amber-400" :
                          a.type === "error" ? "bg-red-400" :
                          "bg-muted-foreground"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm">{a.message}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {new Date(a.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
