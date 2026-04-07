"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fmt$ } from "@/lib/format";
import {
  DollarSign,
  Target,
  Search,
  Loader2,
  CheckCircle2,
  Shield,
  Brain,
  Zap,
  Bot,
  Play,
  FileSpreadsheet,
} from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Alpaca form
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [isPaper, setIsPaper] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Model value
  const [modelValue, setModelValue] = useState("10000");
  const [settingValue, setSettingValue] = useState(false);

  // RapidAPI
  const [rapidApiKey, setRapidApiKey] = useState("");
  const [savingRapid, setSavingRapid] = useState(false);

  // AI Strategy
  const [aiStrategy, setAiStrategy] = useState("");
  const [savingStrategy, setSavingStrategy] = useState(false);

  // Auto trade
  const [runningAutoTrade, setRunningAutoTrade] = useState(false);
  const [autoTradeResult, setAutoTradeResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setModelValue(String(data.portfolio_value || 10000));
        setIsPaper(data.is_paper_trading !== false);
        setAiStrategy(data.ai_strategy || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnectAlpaca() {
    if (!alpacaKey) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/alpaca/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: alpacaKey, secretKey: alpacaSecret, isPaper }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: "Connected",
        description: `Alpaca account connected. Value: ${fmt$(parseFloat(data.portfolioValue))}`,
      });
      setAlpacaKey("");
      setAlpacaSecret("");
      load();
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }

  async function handleSetValue() {
    const val = parseFloat(modelValue);
    if (!val || val <= 0) return;
    setSettingValue(true);
    try {
      const res = await fetch("/api/portfolio/set-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: val }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Updated", description: "Model portfolio value updated" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettingValue(false);
    }
  }

  async function handleSaveRapidApi() {
    if (!rapidApiKey) return;
    setSavingRapid(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapid_api_key: rapidApiKey }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Saved", description: "RapidAPI key saved" });
      setRapidApiKey("");
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingRapid(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure trading connections and portfolio parameters
          </p>
        </div>

        {/* Autonomous AI Trading */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" /> Autonomous AI Trading
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              When enabled, the AI will autonomously screen stocks, select the top momentum picks,
              and execute all trades through your Alpaca account. All transactions are logged to
              Google Sheets for full audit trail.
            </p>

            {!settings?.alpaca_api_key || settings?.alpaca_api_key === "" ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                <p className="text-xs text-amber-400">Connect your Alpaca account below first before enabling autonomous trading.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-Trade Mode</p>
                    <p className="text-xs text-muted-foreground">AI manages all buy/sell decisions</p>
                  </div>
                  <Switch
                    checked={settings?.auto_trade_mode === "active"}
                    onCheckedChange={async (checked) => {
                      const mode = checked ? "active" : "off";
                      await fetch("/api/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ auto_trade_mode: mode }),
                      });
                      toast({ title: checked ? "AI Trading Activated" : "AI Trading Paused", description: checked ? "The AI will manage your portfolio autonomously" : "Autonomous trading has been paused" });
                      load();
                    }}
                    data-testid="switch-auto-trade"
                  />
                </div>

                {settings?.auto_trade_mode === "active" && (
                  <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3 h-3 text-primary" />
                      <p className="text-xs font-medium text-primary">AI Trading Active</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last run: {settings?.last_auto_trade_at ? new Date(settings.last_auto_trade_at).toLocaleString() : "Never"}
                    </p>
                  </div>
                )}

                <Button
                  onClick={async () => {
                    setRunningAutoTrade(true);
                    setAutoTradeResult(null);
                    try {
                      const res = await fetch("/api/auto-trade", { method: "POST" });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Failed");
                      setAutoTradeResult(data);
                      toast({ title: "Auto-trade complete", description: `${data.trades?.length || 0} trades executed` });
                      load();
                    } catch (e: any) {
                      toast({ title: "Auto-trade failed", description: e.message, variant: "destructive" });
                    } finally {
                      setRunningAutoTrade(false);
                    }
                  }}
                  disabled={runningAutoTrade}
                  className="w-full"
                  data-testid="btn-run-auto-trade"
                >
                  {runningAutoTrade ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running AI Trading Cycle...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Run AI Trade Cycle Now</>
                  )}
                </Button>

                {autoTradeResult && (
                  <div className="bg-card border border-border rounded-md p-3 space-y-2">
                    <p className="text-xs font-medium">Cycle Results</p>
                    {autoTradeResult.steps?.map((s: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">- {s}</p>
                    ))}
                    {autoTradeResult.topPicks && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {autoTradeResult.topPicks.map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    )}
                    {autoTradeResult.errors?.length > 0 && (
                      <div className="pt-1">
                        {autoTradeResult.errors.map((e: string, i: number) => (
                          <p key={i} className="text-xs text-destructive">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Google Sheets link */}
            {settings?.google_sheet_id && (
              <div className="flex items-center gap-2 pt-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <a
                  href={`https://docs.google.com/spreadsheets/d/${settings.google_sheet_id}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View Trading Log in Google Sheets
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alpaca */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Alpaca Trading
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings?.alpaca_api_key && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-400">
                  Connected — API key ending in {settings.alpaca_api_key.slice(-4)}
                </span>
                {settings.is_paper_trading && (
                  <Badge variant="outline" className="ml-auto text-yellow-500 border-yellow-500/30 text-xs">
                    <Shield className="w-3 h-3 mr-1" /> Paper
                  </Badge>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="alpaca-key" className="text-xs text-muted-foreground">
                API Key
              </Label>
              <Input
                id="alpaca-key"
                placeholder="APCA-API-KEY-ID"
                value={alpacaKey}
                onChange={(e) => setAlpacaKey(e.target.value)}
                data-testid="input-alpaca-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alpaca-secret" className="text-xs text-muted-foreground">
                Secret Key
              </Label>
              <Input
                id="alpaca-secret"
                type="password"
                placeholder="Secret key"
                value={alpacaSecret}
                onChange={(e) => setAlpacaSecret(e.target.value)}
                data-testid="input-alpaca-secret"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isPaper}
                onCheckedChange={setIsPaper}
                data-testid="switch-paper"
              />
              <Label className="text-sm">Paper Trading Mode</Label>
            </div>
            <Button
              onClick={handleConnectAlpaca}
              disabled={connecting || !alpacaKey}
              className="w-full"
              data-testid="btn-connect-alpaca"
            >
              {connecting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
              ) : (
                "Connect Alpaca"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Model Portfolio Value */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Model Portfolio Value
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set the hypothetical capital for your model portfolio. Weights and market values
              will be calculated from this amount.
            </p>
            {settings?.portfolio_value && (
              <p className="text-sm text-muted-foreground">
                Current: <span className="text-foreground font-medium tabular-nums">{fmt$(settings.portfolio_value)}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="10000"
                value={modelValue}
                onChange={(e) => setModelValue(e.target.value)}
                data-testid="input-model-value"
              />
              <Button
                variant="secondary"
                onClick={handleSetValue}
                disabled={settingValue || !modelValue || parseFloat(modelValue) <= 0}
                data-testid="btn-set-value"
              >
                {settingValue ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Strategy Instructions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> AI Trading Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Define custom instructions for the AI to follow when selecting stocks, weighting
              positions, and making trade decisions. These guide the momentum screen scoring
              and rebalancing logic.
            </p>
            <Textarea
              placeholder={"Example:\n- Overweight technology and AI infrastructure plays\n- Avoid companies with debt/equity > 1.5\n- Prefer stocks with 3+ consecutive quarters of revenue growth\n- Maximum 40% allocation to any single sector\n- Favor mid-cap ($10B-$50B) over mega-cap for higher momentum potential\n- Exit positions that drop below their 50-day moving average"}
              value={aiStrategy}
              onChange={(e) => setAiStrategy(e.target.value)}
              rows={8}
              className="text-sm font-mono"
              data-testid="input-ai-strategy"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {aiStrategy.length > 0 ? `${aiStrategy.length} characters` : "No strategy set"}
              </p>
              <Button
                onClick={async () => {
                  setSavingStrategy(true);
                  try {
                    const res = await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ai_strategy: aiStrategy }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    toast({ title: "Strategy saved", description: "AI trading instructions updated" });
                    load();
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  } finally {
                    setSavingStrategy(false);
                  }
                }}
                disabled={savingStrategy}
                data-testid="btn-save-strategy"
              >
                {savingStrategy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Strategy
              </Button>
            </div>
            {settings?.ai_strategy && (
              <div className="bg-primary/5 border border-primary/10 rounded-md p-3">
                <p className="text-xs font-medium text-primary mb-1">Active Strategy</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{settings.ai_strategy}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seeking Alpha / RapidAPI */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" /> Seeking Alpha (via RapidAPI)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Optional: Add a RapidAPI key to enrich screens with Seeking Alpha quant ratings
              and momentum grades. Free tier: 400 req/mo. Subscribe at rapidapi.com.
            </p>
            {settings?.rapid_api_key && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-400">
                  Key configured (ending in {settings.rapid_api_key.slice(-4)})
                </span>
              </div>
            )}
            <Input
              placeholder="RapidAPI Key"
              value={rapidApiKey}
              onChange={(e) => setRapidApiKey(e.target.value)}
              data-testid="input-rapid-key"
            />
            <Button
              variant="secondary"
              onClick={handleSaveRapidApi}
              disabled={savingRapid || !rapidApiKey}
              className="w-full"
              data-testid="btn-save-rapid"
            >
              {savingRapid ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save RapidAPI Key
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
