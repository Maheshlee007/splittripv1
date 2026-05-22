import { PersonalYearGrid } from "@/components/PersonalYearGrid";
import { PageHeader } from "@/components/PageHeader";

export default function PersonalExpensesPage() {
  return (
    <>
      <PageHeader title="Expenses" subtitle="Monthly overview" />
      <div className="mx-auto max-w-xl px-4 py-4">
        <PersonalYearGrid />
      </div>
    </>
  );
}
