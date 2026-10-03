import { EmptyState } from "@/components/ui/state";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  emptyTitle,
  emptyDescription
}: {
  rows: T[];
  columns: Column<T>[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm shadow-black/10">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-muted/80 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 bg-card">
            {rows.map((row, index) => (
              <tr key={index} className="transition hover:bg-muted/45">
                {columns.map((column) => (
                  <td key={column.key} className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
