import { requireStaff } from "@/lib/auth";
import { apiError, route } from "@/lib/http";
import { runStaffAction, type QueueAction } from "@/lib/staff-action";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, QueueAction> = { next: "NEXT", skip: "SKIP", undo: "UNDO" };

/** POST /api/staff/queue/next | skip | undo */
export const POST = route("staff-queue-action", async (req, { params }: { params: Promise<{ action: string }> }) => {
  const action = ACTIONS[(await params).action];
  if (!action) return apiError(404, "NOT_FOUND", "Không tìm thấy thao tác.");
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  return runStaffAction(req, auth.staff, action);
});
