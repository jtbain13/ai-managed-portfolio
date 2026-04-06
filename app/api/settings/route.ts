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
        ai_strategy: "",
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

  // Ensure settings row exists first
  const { data: existing } = await supabase
    .from("portfolio_settings")
    .select("id")
    .eq("user_id", user.id)
    .single();

  let data, error;

  if (existing) {
    // Update existing row
    const result = await supabase
      .from("portfolio_settings")
      .update(body)
      .eq("user_id", user.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    // Insert new row
    const result = await supabase
      .from("portfolio_settings")
      .insert({ user_id: user.id, ...body })
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

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
