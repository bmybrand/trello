import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const COVERS_BUCKET = "covers";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file" },
        { status: 400 }
      );
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const allowed = ["jpg", "jpeg", "png", "gif", "webp"];
    if (!allowed.includes(ext)) {
      return NextResponse.json(
        { error: "Allowed types: jpg, png, gif, webp" },
        { status: 400 }
      );
    }
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(COVERS_BUCKET)
      .upload(storagePath, file, { upsert: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(data.path);
    return NextResponse.json({ path: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
