import { describe, expect, it } from "vitest";
import { createGroup, deleteGroup, updateGroup } from "@/lib/actions/groups";
import { getGroups } from "@/lib/queries";
import {
  db,
  expectNotRevalidated,
  expectRevalidated,
  makeCategory,
  makeGroup,
} from "./helpers";

describe("createGroup", () => {
  it("creates a group with a trimmed name", async () => {
    expect(await createGroup({ name: "  Pets  " })).toEqual({ ok: true });
    const groups = await db.categoryGroup.findMany();
    expect(groups.map((g) => g.name)).toEqual(["Pets"]);
    expectRevalidated();
  });

  it("rejects an empty name", async () => {
    expect(await createGroup({ name: "   " })).toEqual({ ok: false, error: "Name is required" });
    expect(await db.categoryGroup.count()).toBe(0);
    expectNotRevalidated();
  });

  it("rejects a name longer than 80 characters", async () => {
    expect(await createGroup({ name: "x".repeat(81) })).toEqual({
      ok: false,
      error: "Name is too long",
    });
  });

  it("rejects a duplicate name", async () => {
    await makeGroup("Pets");
    expect(await createGroup({ name: "Pets" })).toEqual({
      ok: false,
      error: "A group with that name already exists",
    });
    expect(await db.categoryGroup.count()).toBe(1);
  });
});

describe("getGroups", () => {
  it("returns groups sorted by name with their category counts", async () => {
    const pets = await makeGroup("Pets");
    await makeGroup("Auto");
    await makeCategory("Vet", "DEBIT", pets.id);
    await makeCategory("Pet Food", "DEBIT", pets.id);

    const groups = await getGroups();
    expect(groups.map((g) => [g.name, g._count.categories])).toEqual([
      ["Auto", 0],
      ["Pets", 2],
    ]);
  });
});

describe("updateGroup", () => {
  it("renames a group", async () => {
    const g = await makeGroup("Pets");
    expect(await updateGroup(g.id, { name: "Animals" })).toEqual({ ok: true });
    expect((await db.categoryGroup.findUniqueOrThrow({ where: { id: g.id } })).name).toBe("Animals");
    expectRevalidated();
  });

  it("rejects renaming to an existing name", async () => {
    await makeGroup("Auto");
    const g = await makeGroup("Pets");
    expect(await updateGroup(g.id, { name: "Auto" })).toEqual({
      ok: false,
      error: "A group with that name already exists",
    });
    expect((await db.categoryGroup.findUniqueOrThrow({ where: { id: g.id } })).name).toBe("Pets");
  });

  it("reports a missing group", async () => {
    expect(await updateGroup(999, { name: "Ghost" })).toEqual({
      ok: false,
      error: "That group no longer exists",
    });
  });
});

describe("deleteGroup", () => {
  it("deletes an empty group", async () => {
    const g = await makeGroup("Pets");
    expect(await deleteGroup(g.id)).toEqual({ ok: true });
    expect(await db.categoryGroup.count()).toBe(0);
    expectRevalidated();
  });

  it("refuses to delete a group that still has categories", async () => {
    const g = await makeGroup("Pets");
    await makeCategory("Vet", "DEBIT", g.id);
    await makeCategory("Pet Food", "DEBIT", g.id);

    const res = await deleteGroup(g.id);
    expect(res).toEqual({
      ok: false,
      error: "This group still has 2 categories. Move or delete them first.",
    });
    expect(await db.categoryGroup.count()).toBe(1);
    expectNotRevalidated();
  });

  it("reports a missing group", async () => {
    expect(await deleteGroup(999)).toEqual({ ok: false, error: "That group no longer exists" });
  });
});
