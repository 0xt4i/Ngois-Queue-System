import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketTracker } from "@/components/customer/ticket-tracker";
import { rpc, type RpcResult } from "@/lib/db";
import type { QueueSnapshot, TicketView } from "@/lib/types";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Số của bạn",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(token)) notFound();
  const r = await rpc<RpcResult<{ ticket: TicketView; state: QueueSnapshot }>>("pb_ticket_view", { p_token: token });
  if (!r.ok) notFound();
  return (
    <div style={brandStyle(r.ticket.shop.primaryColor)}>
      <TicketTracker initialTicket={r.ticket} initialState={r.state} />
    </div>
  );
}
