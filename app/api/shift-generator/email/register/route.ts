import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * POST /api/shift-generator/email/register
 *
 * じゅんさんがプレビュー画面で「登録」ボタンを押したときに呼ばれる。
 * フロントエンドは「登録対象」のみを items に入れて送る前提
 * （重複でスキップ判定したものは送らない）。
 *
 * リクエスト:
 *   {
 *     messageId: string,        // source_message_id に保存
 *     requestedAt?: string,     // メール送信日時 (ISO)。未指定時は now()
 *     items: Array<{
 *       dateISO: string,        // "2026-05-01"
 *       locationId: number,     // locations.id
 *       store: string,          // 表示用（"志比田店" など）
 *       overwriteExistingId?: number  // 既存 shift を上書きする場合の対象 id
 *     }>
 *   }
 *
 * 処理:
 *   - overwriteExistingId 指定あり → 既存行を UPDATE（status='pending'、source_*更新）
 *   - 指定なし → 同 (date, location_id) の既存行があれば skip ＋ conflicts に記録
 *   - 競合なし → INSERT（shift_status='pending', source_type='request_email'）
 *
 * レスポンス:
 *   { inserted, updated, skipped, conflicts: [...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messageId = body?.messageId;
    const items = body?.items;
    const requestedAt = body?.requestedAt
      ? new Date(body.requestedAt).toISOString()
      : new Date().toISOString();

    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json(
        { error: "messageId は必須" },
        { status: 400 },
      );
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items は 1 件以上必要" },
        { status: 400 },
      );
    }

    const conflicts: Array<{
      dateISO: string;
      locationId: number;
      store: string;
      reason: string;
    }> = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const it of items) {
      const dateISO: string = it?.dateISO;
      const locationId: number = it?.locationId;
      const store: string = it?.store ?? "(unknown)";
      const overwriteExistingId: number | undefined =
        typeof it?.overwriteExistingId === "number"
          ? it.overwriteExistingId
          : undefined;

      if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
        conflicts.push({
          dateISO: dateISO ?? "",
          locationId,
          store,
          reason: "dateISO 不正",
        });
        skipped++;
        continue;
      }
      if (!Number.isFinite(locationId)) {
        conflicts.push({
          dateISO,
          locationId,
          store,
          reason: "locationId 不正",
        });
        skipped++;
        continue;
      }

      // 共通の保存値
      const ngmFullName = `ながやま${store}`;
      const baseFields = {
        date: dateISO,
        location_id: locationId,
        rank: null as string | null, // 後で必要なら locations から引いて埋める
        target: null as number | null,
        staff_name: null as string | null,
        note: `仮シフト（${ngmFullName} ${dateISO}、メールから生成）`,
        status: "draft" as const,
        shift_status: "pending" as const,
        source_type: "request_email" as const,
        source_message_id: messageId,
        requested_at: requestedAt,
      };

      // location.rank / target を補完
      const { data: loc } = await supabase
        .from("locations")
        .select("rank, target")
        .eq("id", locationId)
        .maybeSingle();
      if (loc) {
        baseFields.rank = loc.rank;
        baseFields.target = loc.target;
      }

      if (overwriteExistingId !== undefined) {
        const { error: updErr } = await supabase
          .from("shifts")
          .update({
            shift_status: "pending",
            source_type: "request_email",
            source_message_id: messageId,
            requested_at: requestedAt,
            note: baseFields.note,
          })
          .eq("id", overwriteExistingId);
        if (updErr) {
          conflicts.push({
            dateISO,
            locationId,
            store,
            reason: `UPDATE 失敗: ${updErr.message}`,
          });
          skipped++;
        } else {
          updated++;
        }
        continue;
      }

      // 重複チェック
      const { data: existing } = await supabase
        .from("shifts")
        .select("id")
        .eq("date", dateISO)
        .eq("location_id", locationId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        conflicts.push({
          dateISO,
          locationId,
          store,
          reason: `既存 shift(id=${existing.id}) が存在するためスキップ`,
        });
        skipped++;
        continue;
      }

      const { error: insErr } = await supabase
        .from("shifts")
        .insert(baseFields);
      if (insErr) {
        conflicts.push({
          dateISO,
          locationId,
          store,
          reason: `INSERT 失敗: ${insErr.message}`,
        });
        skipped++;
      } else {
        inserted++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      skipped,
      conflicts,
    });
  } catch (err: any) {
    console.error("[email/register]", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "登録に失敗しました",
      },
      { status: 500 },
    );
  }
}
