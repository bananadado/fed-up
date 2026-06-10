import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { FallbackBrowsePage } from "@/pages/FallbackBrowsePage";
import { DeadlineSetupPage } from "@/pages/DeadlineSetupPage";
import { LandingPage } from "@/pages/LandingPage";
import { PlanDashboardPage } from "@/pages/PlanDashboardPage";
import { RecipePage } from "@/pages/RecipePage";
import { RescuePage } from "@/pages/RescuePage";
import { StrategySelectionPage } from "@/pages/StrategySelectionPage";
import { DeadlineModeProvider, useDeadlineMode } from "@/state/DeadlineModeProvider";

function BootstrapBoundary({ children }: { children: ReactNode }) {
  const { state } = useDeadlineMode();

  if (!state.bootstrapped) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          Loading app data from the internal API...
        </div>
      </main>
    );
  }

  if (state.bootstrapError !== null) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-6 py-5 text-amber-950">
          App data could not be loaded: {state.bootstrapError}
        </div>
      </main>
    );
  }

  return children;
}

function AppRoutes() {
  return (
    <BootstrapBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/deadline-mode/setup" element={<DeadlineSetupPage />} />
        <Route path="/deadline-mode/strategies" element={<StrategySelectionPage />} />
        <Route path="/deadline-mode/plan" element={<PlanDashboardPage />} />
        <Route path="/deadline-mode/rescue/:dayId" element={<RescuePage />} />
        <Route path="/recipes/:mealId" element={<RecipePage />} />
        <Route path="/fallbacks" element={<FallbackBrowsePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BootstrapBoundary>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <DeadlineModeProvider>
        <AppRoutes />
      </DeadlineModeProvider>
    </BrowserRouter>
  );
}
