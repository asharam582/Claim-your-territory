import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";
import { moderateImage } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function POST(req: NextRequest) {
  const bucket = process.env.SUPABASE_LOGO_BUCKET || "logos";
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 2 MB)." }, { status: 413 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  }

  const db = serviceClient();
  const ext = file.type.split("/")[1].replace("+xml", "");
  const path = `${new Date().getFullYear()}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await db.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const { data: pub } = db.storage.from(bucket).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  // Screen the image BEFORE it can be used on a spot.
  const verdict = await moderateImage(publicUrl);
  if (!verdict.ok) {
    await db.storage.from(bucket).remove([path]);
    return NextResponse.json(
      { error: "This image can't be used. Please choose another." },
      { status: 422 },
    );
  }

  await db.from("logo_assets").insert({
    storage_path: path,
    public_url: publicUrl,
    mod_status: "ok",
    mod_scores: verdict.scores ?? null,
  });

  return NextResponse.json({ logoUrl: publicUrl, moderated: !verdict.skipped });
}
