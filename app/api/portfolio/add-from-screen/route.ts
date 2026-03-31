import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchQuote, guessSector } from "@/lib/momentum";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tickers, equalWeight } = await request.json();
  if (!tickers || !Array.isArray(tickers)) {
    return NextResponse.json({ error: "tickers array required" }, { status: 400 });
  }

  const maxPos = 5;

  const { data: existingHoldings } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  const existing = existingHoldings || [];
  const existingTickers = new Set(existing.map((h: any) => h.ticker));
  const newTickers = tickers
    .filter((t: string) => !existingTickers.has(t))
    .slice(0, maxPos - existing.length);

  if (newTickers.length === 0) {
    return NextResponse.json(
      { error: "Portfolio full or tickers already held" },
      { status: 400 }
    );
  }

  const allTickers = [...existing.map((h: any) => h.ticker), ...newTickers];
  const weight = equalWeight
    ? Math.round((100 / allTickers.length) * 100) / 100
    : 20;

  // Update existing holding weights
  for (const h of existing) {
    await supabase
      .from("holdings")
      .update({ target_weight: weight })
      .eq("id", h.id)
      .eq("user_id", user.id);
  }

  // Fetch screened data
  const { data: screenedData } = await supabase
    .from("screened_stocks")
    .select("*")
    .eq("user_id", user.id);

  const screened = screenedData || [];
  const added: any[] = [];

  for (const ticker of newTickers) {
    const screenData = screened.find((s: any) => s.ticker === ticker);
    const quote = await fetchQuote(ticker);

    const { data: holding } = await supabase
      .from("holdings")
      .insert({
        user_id: user.id,
        ticker,
        company_name: screenData?.company_name || quote?.name || ticker,
        sector: screenData?.sector || guessSector(ticker),
        target_weight: weight,
        current_weight: 0,
        shares: 0,
        avg_cost_basis: 0,
        current_price: quote?.price || screenData?.price || 0,
        market_value: 0,
        gain_loss: 0,
        gain_loss_percent: 0,
        momentum_score: screenData?.momentum_score || 0,
        sector_score: screenData?.sector_score || 0,
        composite_score: screenData?.composite_score || 0,
        added_at: new Date().toISOString(),
        status: "active",
      })
      .select()
      .single();

    if (holding) added.push(holding);
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "trade",
    message: `Added ${added.length} stocks to portfolio: ${newTickers.join(", ")}`,
  });

  const { data: allHoldings } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active");

  return NextResponse.json({ added, allHoldings: allHoldings || [] });
}
