// Kiểu dữ liệu dùng chung giữa server và client.

export type TicketStatus = "WAITING" | "SERVING" | "DONE" | "SKIPPED" | "EXPIRED" | "CANCELLED";

/** Snapshot công khai của hàng đợi — không chứa tên/SĐT/mã ngày. */
export interface QueueSnapshot {
  shopId: string;
  businessDate: string;
  currentNumber: number | null;
  currentCalledAt: string | null;
  /** Thứ tự sẽ được gọi: vé "Gọi lại" trước, rồi WAITING theo số. */
  queue: number[];
  nextNumbers: number[];
  skippedInGrace: { number: number; turnsLeft: number; recalled: boolean }[];
  waitingCount: number;
  avgServiceSeconds: number;
  avgFromData: boolean;
  isPaused: boolean;
  graceTurns: number;
  serveCount: number;
  version: number;
  updatedAt: string;
}

export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

export interface TicketView {
  id: string;
  number: number;
  token: string;
  name: string;
  status: TicketStatus;
  source: "QR" | "MANUAL";
  businessDate: string;
  isToday: boolean;
  createdAt: string;
  calledAt: string | null;
  doneAt: string | null;
  skippedAt: string | null;
  recalled: boolean;
  cancelledAt: string | null;
  turnsLeft: number | null;
  shop: PublicShop;
}

export interface StaffTicket {
  id: string;
  number: number;
  name: string;
  phone: string | null;
  source: "QR" | "MANUAL";
  status: TicketStatus;
  createdAt: string;
  calledAt: string | null;
  doneAt: string | null;
  skippedAt: string | null;
  recalled: boolean;
  recalledAt: string | null;
  turnsLeft: number | null;
}

export interface StaffQueue {
  session: {
    id: string;
    businessDate: string;
    checkinCode: string;
    codeUpdatedAt: string;
    serveCount: number;
    lastNumber: number;
  };
  shop: { id: string; slug: string; name: string; isPaused: boolean; graceTurns: number; displayKey: string };
  undo: { action: "NEXT" | "SKIP" | "RECALL"; expiresAt: string } | null;
  serverTime: string;
  tickets: StaffTicket[];
}

export interface DayStats {
  date: string;
  total: number;
  done: number;
  serving: number;
  waiting: number;
  skipped: number;
  expired: number;
  cancelled: number;
  manual: number;
  everSkipped: number;
  avgServiceSeconds: number | null;
  avgWaitSeconds: number | null;
}

export type StaffRole = "OWNER" | "STAFF";
