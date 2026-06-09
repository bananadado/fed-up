import { useState } from "react";
import { ArrowRight, Leaf, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { AppButton } from "../components/primitives";
import { GoogleIcon, MicrosoftIcon } from "../components/BrandIcons";
import type { TrackPrototypeEvent } from "../analytics";
import type { AccountMessageTone, AccountProviderId, AccountSummary } from "../accountAuth";

export function Landing({
  onStart,
  track,
  account,
  accountBusy,
  accountMessage,
  accountMessageTone,
  onConnectAccount,
  onSendEmailMagicLink,
}: {
  onStart: () => void;
  track: TrackPrototypeEvent;
  account: AccountSummary;
  accountBusy: AccountProviderId | "email" | "anonymous" | null;
  accountMessage: string;
  accountMessageTone: AccountMessageTone;
  onConnectAccount: (provider: AccountProviderId) => void;
  onSendEmailMagicLink: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen overflow-hidden bg-[#faf9f5]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Leaf size={20} />
          Deadline Food Autopilot
        </div>
        <h1 className="max-w-xl text-5xl font-bold leading-[1.04] sm:text-6xl">Healthy meals that fit around coursework.</h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
          Choose your budget, cooking time and food preferences, then get a realistic plan that keeps easy meals ready when academic work gets busy.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <AppButton onClick={() => { track("deadline_mode_started", { entry_point: "setup_cta" }); onStart(); }} className="px-6 py-3">
            Start fresh <ArrowRight size={17} />
          </AppButton>
        </div>
        {account.configured && (
          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-stone-200" />
              <span className="text-sm font-medium text-stone-400">or sign in to an existing plan</span>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => { track("landing_sign_in_clicked", { provider: "google" }); onConnectAccount("google"); }}
                disabled={accountBusy !== null}
                className="justify-center py-3"
              >
                <GoogleIcon size={15} /> {accountBusy === "google" ? "Connecting..." : "Sign in with Google"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => { track("landing_sign_in_clicked", { provider: "microsoft" }); onConnectAccount("microsoft"); }}
                disabled={accountBusy !== null}
                className="justify-center py-3"
              >
                <MicrosoftIcon size={15} /> {accountBusy === "microsoft" ? "Connecting..." : "Sign in with Microsoft"}
              </AppButton>
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                track("landing_sign_in_clicked", { provider: "email" });
                onSendEmailMagicLink(email);
              }}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="h-auto flex-1 rounded-lg border-stone-200 bg-white p-3 text-sm"
              />
              <AppButton type="submit" variant="secondary" disabled={accountBusy !== null || !email.trim()} className="justify-center">
                <Mail size={15} /> {accountBusy === "email" ? "Sending..." : "Send link"}
              </AppButton>
            </form>
            <p className="mt-1.5 text-xs text-stone-400">Link opens in the same browser. Check spam if it doesn't arrive.</p>
            {accountMessage && (
              <p className={`mt-3 rounded-lg p-3 text-sm ${accountMessageTone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{accountMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
