import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchHistoricalData,
  fetchQuote,
  calculateMomentumConsistency,
  calculateMomentumScore,
  calculateVolatility,
  guessSector,
  SCREEN_UNIVERSE,
  SECTOR_SCORES,
} from "@/lib/momentum";

// This endpoint is called by the cron job to run the full autonomous trading cycle:
// 1. Screen stocks for momentum
// 2. Select top 5
// 3. Determine trades needed (what to buy/sell)
// 4. Execute trades via Alpaca
// 5. Log everything to Supabase + Google Sheets

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(supabase, user.id);
  if (!settings) return NextResponse.json({ error: "No settings found" }, { status: 400 });
  if (!settings.alpaca_api_key || settings.alpaca_api_key.startsWith("••••")) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 400 });
  }

  const results: any = { steps: [], errors: [] };
  const baseUrl = settings.is_paper_trading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  const alpacaHeaders = {
    "APCA-API-KEY-ID": settings.alpaca_api_key,
    "APCA-API-SECRET-KEY": settings.alpaca_secret_key || "",
    "Content-Type": "application/json",
  };

  try {
    // ===== STEP 1: Get account info =====
    const acctRes = await fetch(`${baseUrl}/v2/account`, { headers: alpacaHeaders });
    if (!acctRes.ok) return NextResponse.json({ error: "Alpaca auth failed" }, { status: 401 });
    const account = await acctRes.json();
    const portfolioValue = parseFloat(account.portfolio_value);
    const cash = parseFloat(account.cash);
    results.account = { portfolioValue, cash, status: account.status };
    results.steps.push("Account verified");

    await logActivity(supabase, user.id, "auto_trade", `Auto-trade cycle started. Portfolio: $${portfolioValue.toFixed(2)}, Cash: $${cash.toFixed(2)}`);

    // ===== STEP 2: Run momentum screen =====
    const screenResults = await runScreen(supabase, user.id);
    results.steps.push(`Screened ${screenResults.length} stocks`);
    results.topPicks = screenResults.slice(0, 5).map((s: any) => s.ticker);

    // ===== STEP 3: Determine target portfolio =====
    const maxPositions = settings.max_positions || 5;
    const top5 = screenResults.slice(0, maxPositions);
    const targetWeight = Math.round(100 / maxPositions * 100) / 100;

    // Get current Alpaca positions
    const posRes = await fetch(`${baseUrl}/v2/positions`, { headers: alpacaHeaders });
    const currentPositions = posRes.ok ? await posRes.json() : [];
    const targetTickers = new Set(top5.map((s: any) => s.ticker));

    results.steps.push(`Target portfolio: ${Array.from(targetTickers).join(", ")}`);
    results.steps.push(`Current positions: ${currentPositions.length}`);

    // ===== STEP 4: Execute trades =====
    const trades: any[] = [];
    const investable = portfolioValue * 0.95; // Keep 5% cash buffer

    // Close positions not in target
    for (const pos of currentPositions) {
      if (!targetTickers.has(pos.symbol)) {
        try {
          const closeRes = await fetch(`${baseUrl}/v2/positions/${pos.symbol}`, {
            method: "DELETE",
            headers: alpacaHeaders,
          });
          if (closeRes.ok) {
            const trade = {
              ticker: pos.symbol,
              side: "sell",
              qty: parseFloat(pos.qty),
              price: parseFloat(pos.current_price),
              totalValue: parseFloat(pos.market_value),
              reason: `Auto-trade: Removed from top ${maxPositions} momentum picks`,
              status: "filled",
            };
            trades.push(trade);
            await logTrade(supabase, user.id, trade);
          }
        } catch (e: any) {
          results.errors.push(`Failed to close ${pos.symbol}: ${e.message}`);
        }
      }
    }

    // Buy/rebalance target positions
    for (const stock of top5) {
      const targetValue = investable * (targetWeight / 100);
      const currentPos = currentPositions.find((p: any) => p.symbol === stock.ticker);
      const currentValue = currentPos ? parseFloat(currentPos.market_value) : 0;
      const diff = targetValue - currentValue;

      if (Math.abs(diff) < 50) continue; // Skip tiny adjustments

      const side = diff > 0 ? "buy" : "sell";
      const notional = Math.abs(Math.round(diff * 100) / 100);

      try {
        const orderRes = await fetch(`${baseUrl}/v2/orders`, {
          method: "POST",
          headers: alpacaHeaders,
          body: JSON.stringify({
            symbol: stock.ticker,
            side,
            type: "market",
            time_in_force: "day",
            notional: String(notional),
          }),
        });

        if (orderRes.ok) {
          const order = await orderRes.json();
          const trade = {
            ticker: stock.ticker,
            side,
            qty: 0,
            price: 0,
            totalValue: notional,
            reason: `Auto-trade: ${side === "buy" ? "Enter" : "Rebalance"} position for ${targetWeight}% target (Score: ${stock.compositeScore.toFixed(1)})`,
            status: order.status,
            alpacaOrderId: order.id,
          };
          trades.push(trade);
          await logTrade(supabase, user.id, trade);
        } else {
          const err = await orderRes.json().catch(() => ({}));
          results.errors.push(`Order failed for ${stock.ticker}: ${JSON.stringify(err)}`);
        }
      } catch (e: any) {
        results.errors.push(`Trade error for ${stock.ticker}: ${e.message}`);
      }
    }

    results.trades = trades;
    results.steps.push(`Executed ${trades.length} trades`);

    // ===== STEP 5: Update holdings in DB =====
    // Clear old holdings and insert new ones
    await supabase.from("holdings").delete().eq("user_id", user.id);
    for (const stock of top5) {
      const quote = await fetchQuote(stock.ticker);
      await supabase.from("holdings").insert({
        user_id: user.id,
        ticker: stock.ticker,
        company_name: stock.companyName,
        sector: stock.sector,
        target_weight: targetWeight,
        current_price: quote?.price || stock.price,
        momentum_score: stock.momentumScore,
        sector_score: stock.sectorScore,
        composite_score: stock.compositeScore,
        status: "active",
      });
    }

    // ===== STEP 6: Update settings =====
    await supabase.from("portfolio_settings").update({
      last_auto_trade_at: new Date().toISOString(),
      last_screen_at: new Date().toISOString(),
      last_rebalance: new Date().toISOString(),
      portfolio_value: portfolioValue,
    }).eq("user_id", user.id);

    await logActivity(supabase, user.id, "auto_trade",
      `Auto-trade cycle complete. ${trades.length} trades executed. Top picks: ${results.topPicks.join(", ")}`);

    results.steps.push("Cycle complete");
    return NextResponse.json(results);

  } catch (err: any) {
    await logActivity(supabase, user.id, "error", `Auto-trade failed: ${err.message}`);
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}

// ===== Helper functions =====

async function getSettings(supabase: any, userId: string) {
  const { data } = await supabase
    .from("portfolio_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

async function logActivity(supabase: any, userId: string, type: string, message: string) {
  await supabase.from("activity_log").insert({
    user_id: userId,
    type,
    message,
    details: {},
  });
}

async function logTrade(supabase: any, userId: string, trade: any) {
  await supabase.from("trades").insert({
    user_id: userId,
    ticker: trade.ticker,
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    total_value: trade.totalValue,
    reason: trade.reason,
    status: trade.status,
    alpaca_order_id: trade.alpacaOrderId || null,
  });
}

async function runScreen(supabase: any, userId: string) {
  // Clear old screen results
  await supabase.from("screened_stocks").delete().eq("user_id", userId);

  const results: any[] = [];

  for (let i = 0; i < SCREEN_UNIVERSE.length; i += 10) {
    const batch = SCREEN_UNIVERSE.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const hist = await fetchHistoricalData(ticker);
          if (!hist || hist.prices.length < 60) return null;

          const prices = hist.prices;
          const len = prices.length;
          const currentPrice = prices[len - 1];
          const m1Idx = Math.max(0, len - 21);
          const m3Idx = Math.max(0, len - 63);
          const m6Idx = Math.max(0, len - 126);

          const returns = {
            m1: ((currentPrice - prices[m1Idx]) / prices[m1Idx]) * 100,
            m3: ((currentPrice - prices[m3Idx]) / prices[m3Idx]) * 100,
            m6: ((currentPrice - prices[m6Idx]) / prices[m6Idx]) * 100,
            m12: ((currentPrice - prices[0]) / prices[0]) * 100,
          };

          const consistency = calculateMomentumConsistency(prices);
          const momentumScore = calculateMomentumScore(returns, consistency);
          const volatility = calculateVolatility(prices);

          const quote = await fetchQuote(ticker);
          const sector = guessSector(ticker);
          const sectorData = SECTOR_SCORES[sector] || { score: 50 };
          const compositeScore = momentumScore * 0.70 + sectorData.score * 0.30;

          return {
            ticker,
            companyName: quote?.name || ticker,
            sector,
            price: currentPrice,
            return1m: Math.round(returns.m1 * 100) / 100,
            return3m: Math.round(returns.m3 * 100) / 100,
            return6m: Math.round(returns.m6 * 100) / 100,
            return12m: Math.round(returns.m12 * 100) / 100,
            momentumScore: Math.round(momentumScore * 100) / 100,
            momentumConsistency: Math.round(consistency * 100) / 100,
            volatility: Math.round(volatility * 100) / 100,
            volume: hist.volume,
            sectorScore: sectorData.score,
            compositeScore: Math.round(compositeScore * 100) / 100,
          };
        } catch {
          return null;
        }
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  // Sort by composite score
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  // Save to DB
  for (const stock of results) {
    await supabase.from("screened_stocks").insert({
      user_id: userId,
      ticker: stock.ticker,
      company_name: stock.companyName,
      sector: stock.sector,
      price: stock.price,
      return_1m: stock.return1m,
      return_3m: stock.return3m,
      return_6m: stock.return6m,
      return_12m: stock.return12m,
      momentum_score: stock.momentumScore,
      momentum_consistency: stock.momentumConsistency,
      volatility: stock.volatility,
      volume: stock.volume,
      sector_score: stock.sectorScore,
      composite_score: stock.compositeScore,
    });
  }

  return results;
}
