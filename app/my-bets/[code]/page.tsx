import { TicketDetail } from "./TicketDetail";

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TicketDetail code={code} />;
}
