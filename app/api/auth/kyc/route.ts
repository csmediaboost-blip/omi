import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await req.formData();

    const fullName = formData.get("full_name") as string;
    const address = formData.get("address") as string;
    const city = formData.get("city") as string;
    const documentType = formData.get("document_type") as string;
    const documentNumber = formData.get("document_number") as string;
    const frontPhoto = formData.get("front_photo") as File;
    const selfiePhoto = formData.get("selfie_photo") as File;

    if (!fullName || !address || !city || !documentType || !documentNumber) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Upload documents to Supabase storage
    let frontPhotoUrl = "";
    let selfiePhotoUrl = "";

    if (frontPhoto) {
      const timestamp = Date.now();
      const frontPath = `kyc/${user.id}/front-${timestamp}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("kyc-documents")
        .upload(frontPath, frontPhoto, { upsert: true });

      if (uploadError) {
        console.error("[v0] Front photo upload error:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload front photo" },
          { status: 500 },
        );
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("kyc-documents").getPublicUrl(uploadData.path);
      frontPhotoUrl = publicUrl;
    }

    if (selfiePhoto) {
      const timestamp = Date.now();
      const selfiePath = `kyc/${user.id}/selfie-${timestamp}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("kyc-documents")
        .upload(selfiePath, selfiePhoto, { upsert: true });

      if (uploadError) {
        console.error("[v0] Selfie photo upload error:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload selfie photo" },
          { status: 500 },
        );
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("kyc-documents").getPublicUrl(uploadData.path);
      selfiePhotoUrl = publicUrl;
    }

    // Update user record with KYC info
    const { error: updateError } = await supabase
      .from("users")
      .update({
        kyc_fulll_name: fullName,
        country: city,
        kyc_status: "pending",
        kyc_verified: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[v0] User update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update user KYC data" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "KYC submission received. Under review.",
    });
  } catch (error) {
    console.error("[v0] KYC submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
