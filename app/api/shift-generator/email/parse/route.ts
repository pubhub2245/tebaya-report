import { NextRequest, NextResponse } from "next/server";
import { fetchOneMessage } from "@/lib/gmail/fetch-emails";
import { parseRequestEmail } from "@/lib/email-parser/request-parser";
import { matchLocation } from "@/lib/locationMatcher";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * POST /api/shift-generator/email/parse
 *
 * リクエスト:
 *   { messageId: string, defaultYear?: number }
 *
 * 処理:
 *   1. Gmail から該当メッセージを取得
 *   2. parseRequestEmail で本文をパース
 *   3. 各 (date, store) について matchLocation で location 解決
 *   4. 既存 shifts と (date, location_id) で重複チェック
 *
 * レスポンス:
 *   {
 *     message: { id, subject, from, to, date, plaintextBody, snippet },
 *     parsed: ParsedRequest,
 *     resolvedItems: Array<{
 *       store, dateISO, year, month,
 *       location: { id, name, rank, target } | null,
 *       conflict: { existingShiftId, ... } | null
 *     }>
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messageId = body?.messageId;
    const defaultYear = body?.defaultYear;
    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json(
        { error: "messageId は必須" },
        { status: 400 },
      );
    }

    const message = await fetchOneMessage(messageId);
    if (!message) {
      return NextResponse.json(
        { error: "メッセージが見つかりません" },
        { status: 404 },
      );
    }

    const parsed = parseRequestEmail(message.plaintextBody, {
      defaultYear:
        typeof defaultYear === "number" ? defaultYear : undefined,
    });

    // 各 (date, store) を locations 紐付け＋既存 shifts と突合
    type Resolved = {
      store: string;
      dateISO: string;
      year: number;
      month: number;
      location: { id: number; name: string; rank: string; target: number } | null;
      conflict: {
        existingShiftId: number;
        existingStaff: string | null;
        existingStatus: string | null;
        existingNote: string | null;
      } | null;
    };

    const resolvedItems: Resolved[] = [];

    for (const m of parsed.months) {
      for (const r of m.requests) {
        // matchLocation 用に「ながやま」プレフィックスを付与
        const ngmName = `ながやま${r.store}`;
        const loc = await matchLocation(ngmName);
        for (const dateISO of r.dates) {
          let conflict: Resolved["conflict"] = null;
          if (loc) {
            const { data: existing } = await supabase
              .from("shifts")
              .select("id, staff_name, shift_status, note")
              .eq("date", dateISO)
              .eq("location_id", loc.id)
              .limit(1)
              .maybeSingle();
            if (existing) {
              conflict = {
                existingShiftId: existing.id,
                existingStaff: existing.staff_name ?? null,
                // shift_status カラムが migration 未適用環境では undefined になり得る
                existingStatus: existing.shift_status ?? null,
                existingNote: existing.note ?? null,
              };
            }
          }
          resolvedItems.push({
            store: r.store,
            dateISO,
            year: m.year,
            month: m.month,
            location: loc
              ? {
                  id: loc.id,
                  name: loc.displayName,
                  rank: loc.rank,
                  target: loc.target,
                }
              : null,
            conflict,
          });
        }
      }
    }

    return NextResponse.json({
      message: {
        id: message.id,
        threadId: message.threadId,
        subject: message.subject,
        from: message.from,
        to: message.to,
        date: message.date,
        plaintextBody: message.plaintextBody,
        snippet: message.snippet,
      },
      parsed,
      resolvedItems,
      summary: {
        totalDates: resolvedItems.length,
        unmatchedLocation: resolvedItems.filter((x) => !x.location).length,
        conflicts: resolvedItems.filter((x) => x.conflict).length,
      },
    });
  } catch (err: any) {
    console.error("[email/parse]", err);
    const msg = err?.message || "解析に失敗しました";
    const needsReauth = /再認証|未保存/.test(msg);
    return NextResponse.json(
      { error: msg, needsReauth },
      { status: needsReauth ? 401 : 500 },
    );
  }
}
