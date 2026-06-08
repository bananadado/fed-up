import { ArrowLeft, BookOpen, CalendarDays, CookingPot, Settings2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import fedUpLogo from "@/assets/fed-up-logo.svg";
import { cn } from "@/lib/utils";
import type { TrackPrototypeEvent } from "../analytics";
import type { Screen } from "../types";

export function Shell({
  children,
  screen,
  setScreen,
  previousScreen,
  onBack,
  onboarded,
  track,
}: {
  children: ReactNode;
  screen: Screen;
  setScreen: (screen: Screen) => void;
  previousScreen: Screen | null;
  onBack: () => void;
  onboarded: boolean;
  track: TrackPrototypeEvent;
}) {
  const nav = [
    { id: "dashboard" as const, label: "Today", icon: Sparkles },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
    { id: "plan" as const, label: "Meals", icon: CookingPot },
    { id: "recipes" as const, label: "Recipes", icon: BookOpen },
  ];
  const backTarget = previousScreen ?? "dashboard";
  const showBackButton = previousScreen !== null || screen !== "dashboard";

  return (
    <div className="min-h-screen bg-[#faf9f5] text-stone-900">
      {onboarded && (
        <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#faf9f5]/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={showBackButton ? `Go back to ${backTarget}` : "No previous screen"}
                title={showBackButton ? `Back to ${backTarget}` : undefined}
                disabled={!showBackButton}
                onClick={showBackButton ? () => {
                  track("navigation_back_clicked", { target_screen: backTarget, source_screen: screen, location: "header_back" });
                  onBack();
                } : undefined}
                className={cn(
                  "rounded-lg p-2",
                  showBackButton ? "text-stone-600 hover:bg-stone-100" : "cursor-default text-stone-300 opacity-40",
                )}
              >
                <ArrowLeft size={19} />
              </button>
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => {
                  track("navigation_clicked", { target_screen: "dashboard", source_screen: screen, location: "header_brand" });
                  setScreen("dashboard");
                }}
              >
                <img src={fedUpLogo} alt="Fed Up" className="h-8 w-auto" />
              </button>
            </div>
            <nav className="hidden gap-1 md:flex">
              {nav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    track("navigation_clicked", { target_screen: id, source_screen: screen, location: "desktop_nav" });
                    setScreen(id);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm",
                    screen === id ? "bg-emerald-100 font-semibold text-emerald-800" : "text-stone-600 hover:bg-stone-100",
                  )}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => {
                track("navigation_clicked", { target_screen: "settings", source_screen: screen, location: "settings_button" });
                setScreen("settings");
              }}
              aria-label="Open settings"
              className={cn(
                "rounded-lg p-2",
                screen === "settings" ? "bg-emerald-100 text-emerald-800" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
      )}
      <main className={cn("mx-auto max-w-7xl", onboarded ? "px-4 pb-28 pt-7 sm:px-6 md:pb-10" : "")}>{children}</main>
      {onboarded && (
        <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4 border-t border-stone-200 bg-white px-1 pb-2 pt-2 md:hidden">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                track("navigation_clicked", { target_screen: id, source_screen: screen, location: "mobile_nav" });
                setScreen(id);
              }}
              className={cn("flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px]", screen === id ? "text-emerald-700" : "text-stone-500")}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
