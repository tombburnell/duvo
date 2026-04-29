import { getCounter } from "@/lib/counter";

import { IncrementButton } from "./components/increment-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const count = await getCounter();

  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Hello, world</h1>
      <IncrementButton initialCount={count} />
    </main>
  );
}
