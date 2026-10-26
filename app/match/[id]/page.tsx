import { MatchDetail } from "./MatchDetail";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchDetail id={id} />;
}
