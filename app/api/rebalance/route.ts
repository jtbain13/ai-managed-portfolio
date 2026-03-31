import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("portfolio_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (
    !settings?.alpaca_api_key ||
    settings.alpaca_api_key.startsWith("••••")
  ) {
    return NextResponse.json(
      { error: "Alpaca not configured. Connect your Alpaca account first." },
      { status: 400 }
    );
  }

  try {
    const baseUrl = settings.is_paper_trading
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": settings.alpaca_api_key,
      "APCA-API-SECRET-KEY": settings.alpaca_secret_key || "",
      "Content-Type": "application/json",
    };

    const acctRes = await fetch(`${baseUrl}/v2/account`, { headers });
    if (!acctRes.ok) {
      return NextResponse.json({ error: "Alpaca auth failed" }, { status: 401 });
    }
    const account = await acctRes.json();
    const portfolioValue = parseFloat(account.portfolio_value);
    const cashReserve = (settings.cash_reserve || 5) / 100;
    const investable = portfolioValue * (1 - cashReserve);

    const { data: holdingsData } = await supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active");

    const holdings = holdingsData || [];
    if (holdings.length === 0) {
      return NextResponse.json(
        { error: "No holdings in portfolio to rebalance" },
        { status: 400 }
      );
    }

    const orderResults: any[] = [];

    const posRes = await fetch(`${baseUrl}/v2/positions`, { headers });
    const currentPositions = posRes.ok ? await posRes.json() : [];
    const targetTickers = new Set(holdings.map((h: any) => h.ticker));

    // Close positions not in target portfolio
    for (const pos of currentPositions) {
      if (!targetTickers.has(pos.symbol)) {
        const closeRes = await fetch(`${baseUrl}/v2/positions/${pos.symbol}`, {
          method: "DELETE",
          headers,
        });
        if (closeRes.ok) {
          orderResults.push({
            ticker: pos.symbol,
            action: "closed",
            reason: "Not in target portfolio",
          });
          await supabase.from("trades").insert({
            user_id: user.id,
            ticker: pos.symbol,
            side: "sell",
            qty: parseFloat(pos.qty),
            price: parseFloat(pos.current_price),
            total_value: parseFloat(pos.market_value),
            reason: "Rebalance: removed from portfolio",
            status: "filled",
          });
        }
      }
    }

    // Place orders for target weights
    for (const holding of holdings) {
      const targetValue = investable * ((holding.target_weight || 0) / 100);
      const currentPos = currentPositions.find(
        (p: any) => p.symbol === holding.ticker
      );
      const currentValue = currentPos ? parseFloat(currentPos.market_value) : 0;
      const diff = targetValue - currentValue;

      if (Math.abs(diff) < 10) continue;

      const side = diff > 0 ? "buy" : "sell";
      const notional = Math.abs(Math.round(diff * 100) / 100);

      try {
        const orderRes = await fetch(`${baseUrl}/v2/orders`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            symbol: holding.ticker,
            side,
            type: "market",
            time_in_force: "day",
            notional: String(notional),
          }),
        });

        if (orderRes.ok) {
          const order = await orderRes.json();
          orderResults.push({
            ticker: holding.ticker,
            action: side,
            notional,
            orderId: order.id,
          });
          await supabase.from("trades").insert({
            user_id: user.id,
            ticker: holding.ticker,
            side,
            qty: 0,
            price: 0,
            total_value: notional,
            reason: `Rebalance: ${side} to reach ${holding.target_weight}% target`,
            status: order.status,
            alpaca_order_id: order.id,
          });
        }
      } catch (e: any) {
        orderResults.push({ ticker: holding.ticker, error: e.message });
      }
    }

    await supabase
      .from("portfolio_settings")
      .update({ last_rebalance: new Date().toISOString() })
      .eq("user_id", user.id);

    await supabase.from("activity_log").insert({
      user_id: user.id,
      type: "rebalance",
      message: `Portfolio rebalanced: ${orderResults.length} orders placed`,
      details: orderResults,
    });

    return NextResponse.json({ orders: orderResults, portfolioValue });
  } catch (err: any) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      type: "error",
      message: `Rebalance failed: ${err.message}`,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
