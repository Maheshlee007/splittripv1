import { useParams, useNavigate } from "react-router-dom";
import { PersonalMonthView } from "@/components/PersonalMonthView";
import { PageHeader } from "@/components/PageHeader";
import { monthKeyFullLabel } from "@/lib/personal-utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function MonthDetailPage() {
  const { year, month } = useParams<{ year: string; month: string }>();
  const navigate = useNavigate();

  if (!year || !month) return null;
  const monthKey = `${year}-${month.padStart(2, "0")}`;

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => navigate("/personal/expenses")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={monthKeyFullLabel(monthKey)} subtitle="Personal expenses" />
      </div>
      <div className="mx-auto max-w-xl lg:max-w-5xl px-4 py-4">
        <PersonalMonthView monthKey={monthKey} />
      </div>
    </>
  );
}
