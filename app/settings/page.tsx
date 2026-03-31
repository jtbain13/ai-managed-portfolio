"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fmt$ } from "@/lib/format";
import {
  DollarSign,
  Target,
  Search,
  Loader2,
  CheckCircle2,
  Shield,
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setModelValue(String(data.portfolio_value || 10000));
        setIsPaper(data.is_paper_trading !== false);
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
