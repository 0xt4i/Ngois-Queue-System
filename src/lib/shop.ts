import { cache } from "react";
import { db } from "./db";
import type { PublicShop } from "./types";

export interface ShopRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  timezone: string;
  grace_turns: number;
  default_service_minutes: number;
  day_reset_time: string;
  code_mode: "AUTO" | "MANUAL";
  code_rotate_hours: number;
  phone_retention_days: number;
  is_paused: boolean;
  display_key: string;
}

export const getShopBySlug = cache(async (slug: string): Promise<ShopRow | null> => {
  const { data, error } = await db().from("shops").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return (data as ShopRow | null) ?? null;
});

export async function getShopById(id: string): Promise<ShopRow | null> {
  const { data, error } = await db().from("shops").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ShopRow | null) ?? null;
}

export function toPublicShop(s: ShopRow): PublicShop {
  return { id: s.id, slug: s.slug, name: s.name, logoUrl: s.logo_url, primaryColor: s.primary_color };
}
