import { requireStaff } from "@/lib/auth";
import { db, rpc } from "@/lib/db";
import { apiError, json, parseBody, route } from "@/lib/http";
import { getShopById, type ShopRow } from "@/lib/shop";
import { settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function toSettings(s: ShopRow) {
  return {
    name: s.name,
    slug: s.slug,
    logoUrl: s.logo_url ?? "",
    primaryColor: s.primary_color,
    graceTurns: s.grace_turns,
    defaultServiceMinutes: s.default_service_minutes,
    dayResetTime: s.day_reset_time.slice(0, 5),
    codeMode: s.code_mode,
    codeRotateHours: s.code_rotate_hours,
    phoneRetentionDays: s.phone_retention_days,
    displayKey: s.display_key,
  };
}

export const GET = route("settings-get", async (req) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const shop = await getShopById(auth.staff.shopId);
  if (!shop) return apiError(404, "SHOP_NOT_FOUND", "Không tìm thấy tiệm.");
  return json({ ok: true, settings: toSettings(shop) });
});

export const PUT = route("settings-put", async (req) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const body = await parseBody(req, settingsSchema);
  if (body.response) return body.response;
  const s = body.data;

  const { data, error } = await db()
    .from("shops")
    .update({
      name: s.name,
      slug: s.slug,
      logo_url: s.logoUrl,
      primary_color: s.primaryColor,
      grace_turns: s.graceTurns,
      default_service_minutes: s.defaultServiceMinutes,
      day_reset_time: s.dayResetTime,
      code_mode: s.codeMode,
      code_rotate_hours: s.codeRotateHours,
      phone_retention_days: s.phoneRetentionDays,
    })
    .eq("id", auth.staff.shopId)
    .select("*")
    .single<ShopRow>();
  if (error) {
    if (error.code === "23505") return apiError(409, "SLUG_TAKEN", "Slug này đã được dùng.");
    throw error;
  }
  await db().from("audit_logs").insert({ shop_id: auth.staff.shopId, staff_id: auth.staff.id, action: "SETTINGS_UPDATE" });
  await rpc("pb_touch_state", { p_shop_id: auth.staff.shopId });
  return json({ ok: true, settings: toSettings(data) });
});

/** POST = tạo lại khoá màn hình (URL màn hình cũ hết hiệu lực). */
export const POST = route("settings-display-key", async (req) => {
  const auth = await requireStaff(req, { role: "OWNER" });
  if (auth.response) return auth.response;
  const key = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await db().from("shops").update({ display_key: key }).eq("id", auth.staff.shopId);
  if (error) throw error;
  await db().from("audit_logs").insert({ shop_id: auth.staff.shopId, staff_id: auth.staff.id, action: "DISPLAY_KEY_ROTATE" });
  return json({ ok: true, displayKey: key });
});
