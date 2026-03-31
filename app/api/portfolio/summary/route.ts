import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchQuote } from "@/lib/momentum";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: holdingsData, error: holdingsError } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (holdingsError) return NextResponse.json({ error: holdingsError.message }, { status: 500 });

  const holdings = holdingsData || [];

  const { data: settings } = await supabase
    .from("portfolio_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  let totalValue = 0;
  let totalCost = 0;
  const hasRealShares = holdings.some((h) => h.shares && h.shares > 0);

  // Fetch live prices for all holdings
  const priceMap = new Map<string, number>();
  const nameMap = new Map<string, string>();
  await Promise.all(
    holdings.map(async (h) => {
      const quote = await fetchQuote(h.ticker);
      if (quote && quote.price > 0) {
        priceMap.set(h.ticker, quote.price);
        nameMap.set(h.ticker, quote.name);
      }
    })
  );

  const updatedHoldings: any[] = [];

  if (hasRealShares) {
    // Real portfolio mode
    for (const h of holdings) {
      const currentPrice = priceMap.get(h.ticker) || h.current_price || 0;
      const mktValue = h.shares * currentPrice;
      const cost = h.shares * (h.avg_cost_basis || currentPrice);
      totalValue += mktValue;
      totalCost += cost;

      updatedHoldings.push({
        ...h,
        current_price: currentPrice,
        market_value: Math.round(mktValue * 100) / 100,
        gain_loss: Math.round((mktValue - cost) * 100) / 100,
        gain_loss_percent:
          cost > 0 ? Math.round(((mktValue - cost) / cost) * 10000) / 100 : 0,
      });
    }
  } else {
    // Model portfolio mode
    const modelValue =
      settings?.portfolio_value && settings.portfolio_value > 0
        ? settings.portfolio_value
        : 10000;
    totalValue = modelValue;
    const totalTargetWeight = holdings.reduce(
      (sum, h) => sum + (h.target_weight || 0),
      0
    );

    for (const h of holdings) {
      const currentPrice = priceMap.get(h.ticker) || h.current_price || 0;
      const allocatedValue =
        modelValue * ((h.target_weight || 0) / Math.max(totalTargetWeight, 1));
      const modelShares = currentPrice > 0 ? allocatedValue / currentPrice : 0;
      const costBasis =
        h.avg_cost_basis && h.avg_cost_basis > 0 ? h.avg_cost_basis : currentPrice;
      const cost = modelShares * costBasis;
      totalCost += cost;

      updatedHoldings.push({
        ...h,
        current_price: currentPrice,
        shares: Math.round(modelShares * 10000) / 10000,
        avg_cost_basis: costBasis,
        market_value: Math.round(allocatedValue * 100) / 100,
        gain_loss: Math.round((allocatedValue - cost) * 100) / 100,
        gain_loss_percent:
          cost > 0
            ? Math.round(((allocatedValue - cost) / cost) * 10000) / 100
            : 0,
      });
    }
  }

  // Compute current weights and update DB
  for (const h of updatedHoldings) {
    const currentWeight =
      totalValue > 0
        ? Math.round((h.market_value / totalValue) * 10000) / 100
        : 0;
    h.current_weight = currentWeight;

    await supabase
      .from("holdings")
      .update({
        current_price: h.current_price,
        market_value: h.market_value,
        gain_loss: h.gain_loss,
        gain_loss_percent: h.gain_loss_percent,
        current_weight: currentWeight,
        shares: h.shares,
        avg_cost_basis: h.avg_cost_basis,
      })
      .eq("id", h.id)
      .eq("user_id", user.id);
  }

  // Update portfolio value in settings
  if (settings) {
    await supabase
      .from("portfolio_settings")
      .update({ portfolio_value: Math.round(totalValue * 100) / 100 })
      .eq("user_id", user.id);
  }

  return NextResponse.json({
    totalValue: Math.round(totalValue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalGainLoss: Math.round((totalValue - totalCost) * 100) / 100,
    totalGainLossPercent:
      totalCost > 0
        ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100
        : 0,
    positionCount: updatedHoldings.length,
    holdings: updatedHoldings,
    isModelPortfolio: !hasRealShares,
  });
}
