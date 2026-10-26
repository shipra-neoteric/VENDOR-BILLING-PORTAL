interface Props {
  planned: number;
  // The quantity the work order was first signed off at — only present once an approved
  // variance has raised the plan (Backend: reviseWorkOrderPlan).
  original?: number | null;
  format?: (n: number) => string;
}

const defaultFormat = (n: number) => (n ?? 0).toLocaleString("en-IN");

// A scope item's planned quantity, with "Revised (was X)" underneath when an approved variance
// has raised it — so the work order shows both the original plan and the revised one.
export default function PlannedQtyCell({ planned, original, format = defaultFormat }: Props) {
  const revised = original != null && original !== planned;
  return (
    <>
      {format(planned)}
      {revised && (
        <span className="block font-sans text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
          Revised (was {format(original as number)})
        </span>
      )}
    </>
  );
}
