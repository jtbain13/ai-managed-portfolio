import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("portfolio_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // Create default settings
    const { data: newSettings, error: createError } = await supabase
      .from("portfolio_settings")
      .insert({
        user_id: user.id,
        is_paper_trading: true,
        max_positions: 5,
        drift_threshold: 5,
        cash_reserve: 5,
        auto_trade_enabled: false,
        portfolio_value: 10000,
      })
      .select()
      .single();

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

    return NextResponse.json({
      ...newSettings,
      alpaca_api_key: "",
      alpaca_secret_key: "",
      rapid_api_key: "",
    });
  }

  // Mask API keys
  return NextResponse.json({
    ...data,
    alpaca_api_key: data.alpaca_api_key ? "••••" + data.alpaca_api_key.slice(-4) : "",
    alpaca_secret_key: data.alpaca_secret_key ? "••••" + data.alpaca_secret_key.slice(-4) : "",
    rapid_api_key: data.rapid_api_key ? "••••" + data.rapid_api_key.slice(-4) : "",
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const { data, error } = await supabase
    .from("portfolio_settings")
    .upsert({ user_id: user.id, ...body }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "settings",
    message: "Portfolio settings updated",
    details: { fields: Object.keys(body) },
  });

  return NextResponse.json(data);
}
