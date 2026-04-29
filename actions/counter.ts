"use server";

import { revalidatePath } from "next/cache";
import { incrementCounter } from "@/lib/counter";

export async function incrementCounterAction(): Promise<void> {
  await incrementCounter();
  revalidatePath("/");
}
