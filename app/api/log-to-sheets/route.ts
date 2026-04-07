import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// This endpoint syncs the latest portfolio state to Google Sheets
// Called after auto-trade cycle completes, or manually from the dashboard

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sheetId, type, data: logData } = body;

  if (!sheetId) return NextResponse.json({ error: "No sheet ID" }, { status: 400 });

  // This endpoint stores the sheet ID and log type for the cron to use
  // The actual Google Sheets writing is done by the Computer cron job
  // which has access to the Google Sheets connector

  // Store the pending log entry
  await supabase.from("activity_log").insert({
    user_id: user.id,
    type: "sheet_log",
    message: `Queued ${type} log to Google Sheets`,
    details: { sheetId, type, data: logData },
  });

  return NextResponse.json({ ok: true, queued: type });
}
