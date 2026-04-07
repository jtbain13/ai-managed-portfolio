import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Manual trigger from the dashboard UI
// The real AI-driven trading runs via the Computer cron job
// which has access to LLMs and can interpret the user's strategy instructions

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("portfolio_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!settings) return NextResponse.json({ error: "No settings found" }, { status: 400 });
  if (!settings.alpaca_api_key || settings.alpaca_api_key.startsWith("••••")) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 400 });
  }

  // Get current account status
  const baseUrl = settings.is_paper_trading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  const headers = {
    "APCA-API-KEY-ID": settings.alpaca_api_key,
    "APCA-API-SECRET-KEY": settings.alpaca_secret_key || "",
  };

  const acctRes = await fetch(`${baseUrl}/v2/account`, { headers });
  if (!acctRes.ok) return NextResponse.json({ error: "Alpaca auth failed" }, { status: 401 });
  const account = await acctRes.json();

  const posRes = await fetch(`${baseUrl}/v2/positions`, { headers });
  const positions = posRes.ok ? await posRes.json() : [];

  // Log that a manual trigger was requested
  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "auto_trade",
    message: "Manual AI trade cycle requested from dashboard",
    details: {
      portfolio_value: account.portfolio_value,
      cash: account.cash,
      positions: positions.length,
    },
  });

  return NextResponse.json({
    message: "AI trading cycle queued. The AI agent will analyze your strategy and execute trades.",
    account: {
      portfolioValue: parseFloat(account.portfolio_value),
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      status: account.status,
    },
    currentPositions: positions.map((p: any) => ({
      ticker: p.symbol,
      qty: parseFloat(p.qty),
      marketValue: parseFloat(p.market_value),
      unrealizedPl: parseFloat(p.unrealized_pl),
    })),
    strategy: settings.ai_strategy || "No custom strategy set - using default momentum screening",
    autoTradeMode: settings.auto_trade_mode,
  });
}
