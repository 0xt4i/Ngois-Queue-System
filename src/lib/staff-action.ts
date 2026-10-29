import type { NextRequest } from "next/server";
import type { StaffUser } from "./auth";
import { rpc, type RpcResult } from "./db";
import { businessError, json } from "./http";
import { logger } from "./logger";
import type { QueueSnapshot } from "./types";

export type QueueAction = "NEXT" | "SKIP" | "RECALL" | "CANCEL" | "UNDO";

/** Thực thi 1 thao tác hàng đợi của nhân viên (atomic trong Postgres, idempotent theo header). */
export async function runStaffAction(
  req: NextRequest,
  staff: StaffUser,
  action: QueueAction,
  ticketId: string | null = null,
) {
  const idem = req.headers.get("idempotency-key");
  const r = await rpc<RpcResult<{ action: QueueAction; servedNumber: number | null; state: QueueSnapshot; replayed?: boolean }>>(
    "pb_staff_action",
    {
      p_shop_id: staff.shopId,
      p_staff_id: staff.id,
      p_action: action,
      p_ticket_id: ticketId,
      p_idem_key: idem && idem.length <= 100 ? idem : null,
    },
  );
  if (!r.ok) return businessError(r);
  logger.info({ staff: staff.username, action, servedNumber: r.servedNumber, replayed: !!r.replayed }, "queue action");
  return json(r);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
