import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const { data: userRow } = await supabase
      .from("users")
      .select("app_role")
      .eq("auth_id", user.id)
      .single();
    const appRole = ((userRow as { app_role?: string | null } | null)?.app_role ?? "").toLowerCase().trim();
    if (appRole !== "admin" && appRole !== "superadmin") {
      return NextResponse.json({ error: "Only admins can update passwords" }, { status: 403 });
    }
    const body = await request.json();
    const { authId, newPassword } = body as { authId?: string; newPassword?: string };
    if (!authId || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "authId and newPassword (min 6 chars) required" },
        { status: 400 }
      );
    }
    const admin = createServiceClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(authId, {
      password: newPassword,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
