function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  defaultShopSlug: process.env.NEXT_PUBLIC_DEFAULT_SHOP_SLUG ?? "demo-photobooth",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  isProd: process.env.NODE_ENV === "production",
};
