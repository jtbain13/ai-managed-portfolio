import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SCREEN_UNIVERSE,
  SECTOR_SCORES,
  fetchHistoricalData,
  fetchQuote,
  fetchSeekingAlphaData,
  calculateMomentumConsistency,
  calculateMomentumScore,
  calculateVolatility,
  guessSector,
} from "@/lib/momentum";

export const maxDuration = 300; // 5 min timeout for Vercel

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Log start
  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "screen",
    message: "Starting momentum screen on 100-stock universe...",
  });

  // Get settings for RapidAPI key
  const { data: settings } = await supabase
    .from("portfolio_settings")
    .select("rapid_api_key")
    .eq("user_id", user.id)
    .single();

  const rapidApiKey = settings?.rapid_api_key || "";

  try {
    // Clear old screened stocks for this user
    await supabase.from("screened_stocks").delete().eq("user_id", user.id);

    const results: any[] = [];

    // Process in batches of 10
    for (let i = 0; i < SCREEN_UNIVERSE.length; i += 10) {
      const batch = SCREEN_UNIVERSE.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(async (ticker) => {
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
          const sector = quote?.sector || guessSector(ticker);
          const sectorData = SECTOR_SCORES[sector] || { score: 50 };
          const sectorScore = sectorData.score;

          const compositeScore = momentumScore * 0.7 + sectorScore * 0.3;

          return {
            user_id: user.id,
            ticker,
            company_name: quote?.name || ticker,
            sector,
            price: currentPrice,
            return_1m: Math.round(returns.m1 * 100) / 100,
            return_3m: Math.round(returns.m3 * 100) / 100,
            return_6m: Math.round(returns.m6 * 100) / 100,
            return_12m: Math.round(returns.m12 * 100) / 100,
            momentum_score: Math.round(momentumScore * 100) / 100,
            momentum_consistency: Math.round(consistency * 100) / 100,
            volatility: Math.round(volatility * 100) / 100,
            volume: hist.volume,
            sector_score: sectorScore,
            composite_score: Math.round(compositeScore * 100) / 100,
            sa_quant_rating: "",
            sa_momentum_grade: "",
            screened_at: new Date().toISOString(),
          };
        })
      );
      results.push(...batchResults.filter(Boolean));
    }

    // Enrich with Seeking Alpha data if API key available (not masked)
    if (rapidApiKey && !rapidApiKey.startsWith("••••")) {
      const top30 = [...results]
        .sort((a, b) => b.composite_score - a.composite_score)
        .slice(0, 30);
      const saData = await fetchSeekingAlphaData(
        top30.map((s) => s.ticker),
        rapidApiKey
      );
      for (const stock of results) {
        const sa = saData.get(stock.ticker);
        if (sa) {
          stock.sa_quant_rating = sa.quantRating;
          stock.sa_momentum_grade = sa.momentumGrade;
        }
      }
    }

    // Save to DB in batches
    if (results.length > 0) {
      await supabase.from("screened_stocks").insert(results);
    }

    const sorted = results.sort((a, b) => b.composite_score - a.composite_score);

    await supabase.from("activity_log").insert({
      user_id: user.id,
      type: "screen",
      message: `Momentum screen complete: ${results.length} stocks analyzed`,
      details: {
        topPicks: sorted.slice(0, 5).map((s) => s.ticker),
      },
    });

    return NextResponse.json({ count: results.length, stocks: sorted });
  } catch (err: any) {
    await supabase.from("activity_log").insert({
      user_id: user.id,
      type: "error",
      message: `Screen failed: ${err.message}`,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
