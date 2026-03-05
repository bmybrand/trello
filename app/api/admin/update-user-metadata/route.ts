import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase";

/** POST: update auth.users user_metadata (and optionally email) for a user. Admin only. Keeps auth.users in sync with public.users. */
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
      return NextResponse.json({ error: "Only admins can update user metadata" }, { status: 403 });
    }

    const body = await request.json();
    const { authId, full_name, email, profile_image } = body as {
      authId?: string;
      full_name?: string;
      email?: string;
      profile_image?: string;
    };
    if (!authId || typeof authId !== "string") {
      return NextResponse.json({ error: "authId required" }, { status: 400 });
    }

    const user_metadata: Record<string, string> = {};
    if (full_name !== undefined) user_metadata.full_name = String(full_name).trim();
    if (profile_image !== undefined) user_metadata.avatar_url = String(profile_image).trim();

    const admin = createServiceClient();
    const updatePayload: { user_metadata?: Record<string, string>; email?: string } = {};
    if (Object.keys(user_metadata).length > 0) updatePayload.user_metadata = user_metadata;
    if (email !== undefined && typeof email === "string") updatePayload.email = email.trim();

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(authId, {
      ...updatePayload,
      ...(updatePayload.email && { email_confirm: true }),
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
