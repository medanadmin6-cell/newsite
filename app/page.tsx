import { Suspense } from "react";
import { HomeBoard } from "./HomeBoard";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeBoard />
    </Suspense>
  );
}
