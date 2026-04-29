"use client";

import { useFormStatus } from "react-dom";

import { incrementCounterAction } from "@/actions/counter";

type Props = {
  initialCount: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "0.5rem 1rem",
        fontSize: "1rem",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "…" : "Increment"}
    </button>
  );
}

export function IncrementButton({ initialCount }: Props) {
  return (
    <form action={incrementCounterAction}>
      <p style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Count: <strong>{initialCount}</strong>
      </p>
      <SubmitButton />
    </form>
  );
}
