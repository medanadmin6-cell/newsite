import { TrackerView } from "./TrackerView";

export default async function TrackerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackerView id={id} />;
}
