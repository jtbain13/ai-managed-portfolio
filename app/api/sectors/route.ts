import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SECTOR_SCORES } from "@/lib/momentum";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error } = await supabase
    .from("sector_outlook")
    .select("*")
    .order("score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!existing || existing.length === 0) {
    // Seed sectors
    const inserts = Object.entries(SECTOR_SCORES)
      .filter(([sector]) => sector !== "Financials")
      .map(([sector, data]) => ({
        sector,
        score: data.score,
        rationale: data.rationale,
        key_trends: data.trends,
        updated_at: new Date().toISOString(),
      }));

    const { data: seeded, error: seedError } = await supabase
      .from("sector_outlook")
      .upsert(inserts, { onConflict: "sector" })
      .select()
      .order("score", { ascending: false });

    if (seedError) return NextResponse.json({ error: seedError.message }, { status: 500 });
    return NextResponse.json(seeded || []);
  }

  return NextResponse.json(existing);
}
