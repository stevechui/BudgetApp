import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ActionResult } from "@/lib/validation";

export function revalidateAll() {
  revalidatePath("/", "layout");
}

export function handleDbError(e: unknown, what: string): ActionResult {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const article = /^[aeiou]/i.test(what) ? "An" : "A";
      return { ok: false, error: `${article} ${what} with that name already exists` };
    }
    if (e.code === "P2025") return { ok: false, error: `That ${what} no longer exists` };
    if (e.code === "P2003") return { ok: false, error: `That ${what} is still in use` };
  }
  console.error(e);
  return { ok: false, error: "Something went wrong" };
}
