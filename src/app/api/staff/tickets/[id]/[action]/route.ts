import { requireStaff } from "@/lib/auth";
import { apiError, route } from "@/lib/http";
import { runStaffAction, UUID_RE, type QueueAction } from "@/lib/staff-action";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, QueueAction> = { recall: "RECALL", cancel: "CANCEL" };

/** POST /api/staff/tickets/{id}/recall | cancel */
export const POST = route(
  "staff-ticket-action",
  async (req, { params }: { params: Promise<{ id: string; action: string }> }) => {
    const { id, action: raw } = await params;
    const action = ACTIONS[raw];
    if (!action || !UUID_RE.test(id)) return apiError(404, "NOT_FOUND", "Không tìm thấy thao tác.");
    const auth = await requireStaff(req);
    if (auth.response) return auth.response;
    return runStaffAction(req, auth.staff, action, id);
  },
);
