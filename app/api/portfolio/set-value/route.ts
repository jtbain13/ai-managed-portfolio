import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { value } = await request.json();
  if (!value || value <= 0) {
    return NextResponse.json({ error: "Value must be positive" }, { status: 400 });
  }

  // Ensure settings row exists
  const { data: existing } = await supabase
    .from("portfolio_settings")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    await supabase
      .from("portfolio_settings")
      .update({ portfolio_value: value })
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("portfolio_settings")
      .insert({ user_id: user.id, portfolio_value: value });
  }

  // Reset shares so they recalculate on next summary refresh
  await supabase
    .from("holdings")
    .update({ shares: 0, avg_cost_basis: 0 })
    .eq("user_id", user.id);

  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "settings",
    message: `Model portfolio value set to $${value.toLocaleString()}`,
  });

  return NextResponse.json({ ok: true, value });
}
