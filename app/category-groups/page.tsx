import { Suspense } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { GroupForm } from "@/components/group-form";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteGroup } from "@/lib/actions/groups";
import { getGroups } from "@/lib/queries";

export default function CategoryGroupsPage() {
  return (
    <>
      <PageHeader
        title="Category Groups"
        description="Groups bundle categories together for reporting."
      >
        <GroupForm
          trigger={
            <Button>
              <PlusIcon /> New group
            </Button>
          }
        />
      </PageHeader>
      <Suspense fallback={<LoadingBlock />}>
        <GroupsTable />
      </Suspense>
    </>
  );
}

async function GroupsTable() {
  const groups = await getGroups();
  return (
    <div className="rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Categories</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                No category groups yet.
              </TableCell>
            </TableRow>
          )}
          {groups.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/categories?group=${g.id}`}
                  className="text-muted-foreground hover:underline"
                >
                  {g._count.categories}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <GroupForm
                    group={{ id: g.id, name: g.name }}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Edit">
                        <PencilIcon />
                      </Button>
                    }
                  />
                  <ConfirmDelete
                    title={`Delete "${g.name}"?`}
                    description={
                      g._count.categories > 0
                        ? `This group has ${g._count.categories} categories. Move or delete them before deleting the group.`
                        : "This cannot be undone."
                    }
                    disabled={g._count.categories > 0}
                    onConfirm={deleteGroup.bind(null, g.id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
