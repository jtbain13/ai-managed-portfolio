import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey, secretKey, isPaper } = await request.json();

  try {
    const baseUrl = isPaper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

    const acctRes = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secretKey,
      },
    });

    if (!acctRes.ok) {
      return NextResponse.json({ error: "Invalid Alpaca credentials" }, { status: 401 });
    }

    const account = await acctRes.json();

    await supabase.from("portfolio_settings").upsert(
      {
        user_id: user.id,
        alpaca_api_key: apiKey,
        alpaca_secret_key: secretKey,
        is_paper_trading: isPaper,
        portfolio_value: parseFloat(account.portfolio_value || "0"),
      },
      { onConflict: "user_id" }
    );

    await supabase.from("activity_log").insert({
      user_id: user.id,
      type: "settings",
      message: `Connected to Alpaca ${isPaper ? "paper" : "live"} trading. Account value: $${parseFloat(account.portfolio_value).toLocaleString()}`,
    });

    return NextResponse.json({
      status: account.status,
      buyingPower: account.buying_power,
      portfolioValue: account.portfolio_value,
      cash: account.cash,
      accountNumber: account.account_number,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
