import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStoreProvider } from "@/store/AppStore";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import AppShell from "@/components/AppShell";
import TripsPage from "@/pages/TripsPage";
import GroupPage from "@/pages/GroupPage";
import TripPickerPage from "@/pages/TripPickerPage";
import MePage from "@/pages/MePage";
import MonthDetailPage from "@/pages/MonthDetailPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppStoreProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<TripsPage />} />
                <Route path="/trip/:id" element={<GroupPage />} />
                <Route path="/expenses" element={<TripPickerPage title="Expenses" subtitle="Across your trips" target="expenses" />} />
                <Route path="/balances" element={<TripPickerPage title="Balances" subtitle="Across your trips" target="balances" />} />
                <Route path="/requests" element={<TripPickerPage title="Requests" subtitle="Across your trips" target="requests" />} />
                <Route path="/me" element={<MePage />} />
                <Route path="/me/month/:year/:month" element={<MonthDetailPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ConfirmProvider>
      </AppStoreProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
