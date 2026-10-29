import { z } from "zod";

/** Chuẩn hoá SĐT VN: bỏ khoảng trắng/dấu chấm, +84 → 0. */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  else if (p.startsWith("84") && p.length === 11) p = "0" + p.slice(2);
  return p;
}

const PHONE_MSG = "Số điện thoại phải gồm 10 số, bắt đầu bằng 0";

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^0\d{9}$/, PHONE_MSG));

export const nameSchema = z.string().trim().min(1, "Vui lòng nhập tên").max(60, "Tên tối đa 60 ký tự");

export const codeSchema = z.string().trim().regex(/^\d{4}$/, "Mã ngày gồm 4 chữ số");

export const createTicketSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  phone: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizePhone(v) : undefined))
    .pipe(z.string().regex(/^0\d{9}$/, PHONE_MSG).optional()),
});
export const lookupSchema = z.object({ code: codeSchema, phone: phoneSchema });

export const manualTicketSchema = z.object({
  name: nameSchema,
  phone: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizePhone(v) : undefined))
    .pipe(z.string().regex(/^0\d{9}$/, PHONE_MSG).optional()),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(40),
  password: z.string().min(1).max(200),
});

export const rotateCodeSchema = z.object({ code: codeSchema.optional() });

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên tiệm").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Slug chỉ gồm chữ thường, số, dấu gạch ngang"),
  logoUrl: z.union([z.literal(""), z.url().max(500)]).transform((v) => v || null),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu dạng #RRGGBB"),
  graceTurns: z.coerce.number().int().min(0).max(20),
  defaultServiceMinutes: z.coerce.number().int().min(1).max(180),
  dayResetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ dạng HH:mm"),
  codeMode: z.enum(["AUTO", "MANUAL"]),
  codeRotateHours: z.coerce.number().int().min(0).max(24),
  phoneRetentionDays: z.coerce.number().int().min(1).max(3650),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "Tên đăng nhập 3–40 ký tự: chữ thường, số, . _ -");
export const passwordSchema = z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(200);

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(60).default(""),
  password: passwordSchema,
  role: z.enum(["OWNER", "STAFF"]),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  password: passwordSchema.optional(),
  role: z.enum(["OWNER", "STAFF"]).optional(),
  isActive: z.boolean().optional(),
});

export const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
