import { ArrowLeft, Check, ExternalLink, ShieldCheck } from "lucide-react";

import fedUpLogo from "@/assets/fed-up-logo.svg";
import { cn } from "@/lib/utils";
import type { AnalyticsProperties } from "@/lib/posthog";
import { AppButton, Badge } from "../components/primitives";
import { PRIVACY_CONSENT_TEXT, PRIVACY_POLICY_URL, PRIVACY_POLICY_VERSION } from "../sessionPersistence";
import type { Screen } from "../types";

const effectiveDate = "9 June 2026";
type TrackEvent = (eventName: string, properties?: AnalyticsProperties) => void;

const sections = [
  {
    title: "Who this policy covers",
    body: [
      "This policy applies to Fed Up, a student deadline-week meal planning service. It covers the website, anonymous session storage, calendar import, recipe features, recommender calls, nutrition lookups and analytics used by Fed Up.",
      "The controller for Fed Up data is the Fed Up project team. Use the project contact details supplied with your invitation for privacy requests or questions.",
    ],
  },
  {
    title: "Information we collect",
    body: [
      "Anonymous session identifier, onboarding choices, cooking ability, kitchen access, weekly food budget, university, postcode or broad area, dietary requirements, allergens, likes, dislikes, available ingredients, selected recipe sources, saved recipes, rejected recipes, generated plans and manual plan edits.",
      "If you import a calendar, we process calendar event titles, dates, times, recurrence details, source, imported timestamp, derived deadline context and any Google or Microsoft refresh tokens needed to keep your calendar import working.",
      "If you create or edit recipes, we process recipe names, ingredients, instructions, nutrition estimates, reviews, images and related interaction events. Analytics may record product events such as screens viewed, buttons clicked and onboarding progress, but should not include raw postcode, full address, email, name, calendar token or free-text sensitive content.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use your information to create and maintain your meal plan, adapt cooking effort around deadline pressure, filter for dietary requirements and allergens, suggest campus or nearby fallback options, save session state, improve recommendations, debug reliability issues and measure aggregate product usage.",
      "We do not sell personal information. We do not use your calendar, allergy, dietary or location preference data for advertising.",
    ],
  },
  {
    title: "Legal basis",
    body: [
      "Consent is used for onboarding data that may include dietary requirements, allergens, calendar information and location preference signals. You give that consent by ticking the privacy consent checkbox before creating a plan.",
      "Legitimate interests may be used for strictly necessary operations such as security, abuse prevention, reliability, basic analytics and error handling, where those interests are not overridden by your rights. Contract necessity may apply when processing is needed to provide the meal-planning experience you request.",
    ],
  },
  {
    title: "Sharing and processors",
    body: [
      "We use service providers only as needed to run Fed Up: Firebase or Google Cloud for backend storage and functions, Google Calendar and Microsoft Graph when you choose those imports, PostHog for product analytics, Open Food Facts and USDA FoodData Central for nutrition lookup, and any configured recommender service for recipe recommendations.",
      "Calendar imports are optional. Google and Microsoft receive only the OAuth and calendar API requests needed to connect the calendar account you choose.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Anonymous session data is retained for up to 90 days after last use unless deleted earlier. Calendar refresh tokens are stored only while calendar import remains configured. Aggregated analytics may be retained longer where it no longer identifies a user.",
      "Recipe photos and user-created recipes may remain available until deleted from your session or removed by the project team.",
    ],
  },
  {
    title: "Your choices and rights",
    body: [
      "You can skip calendar import, use a broad campus postcode instead of a home postcode, change preferences in Settings, and stop using Fed Up without creating a plan.",
      "Depending on where you live, you may have rights to access, correct, delete, restrict or object to processing of your personal information, withdraw consent, and complain to your data protection regulator. Withdrawing consent does not affect processing that already happened before withdrawal.",
    ],
  },
  {
    title: "Security and limits",
    body: [
      "We use reasonable technical and organisational measures, including anonymous session IDs, bounded payloads, token validation and retention limits. No web service can guarantee absolute security.",
      "Fed Up is not medical, nutritional or allergy safety advice. Allergen and dietary filters reduce risk but users remain responsible for checking labels, ingredients and cross-contamination information before eating.",
    ],
  },
  {
    title: "International transfers and children",
    body: [
      "Service providers may process information in the United Kingdom, United States, European Economic Area or other locations where they operate. Where required, transfers should be protected by appropriate safeguards such as standard contractual clauses.",
      "Fed Up is intended for university students and is not directed to children under 13. Fed Up should not knowingly collect personal information from children.",
    ],
  },
  {
    title: "Changes",
    body: [
      "If this policy changes in a material way, Fed Up will update the policy version and ask for renewed consent before users continue into the app.",
    ],
  },
];

export function PrivacyPolicyScreen({
  consentRequired,
  hasConsent,
  accepted,
  onAcceptedChange,
  onAccept,
  setScreen,
  previousScreen,
  track,
}: {
  consentRequired: boolean;
  hasConsent: boolean;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onAccept: () => void;
  setScreen: (screen: Screen) => void;
  previousScreen: Screen | null;
  track: TrackEvent;
}) {
  const canReturnToApp = hasConsent && previousScreen !== null && previousScreen !== "privacy-policy";
  const backTarget: Screen = canReturnToApp ? previousScreen : "landing";

  return (
    <main className="min-h-screen bg-[#faf9f5] px-4 py-7 text-stone-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              track("privacy_policy_back_clicked", { target_screen: backTarget });
              setScreen(backTarget);
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100"
          >
            <ArrowLeft size={17} /> Back
          </button>
          <img src={fedUpLogo} alt="Fed Up" className="h-8 w-auto" />
        </header>

        <div className="border-b border-stone-200 pb-7">
          <Badge tone="green">Privacy Policy</Badge>
          <div className="mt-4 flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck size={21} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-stone-950 sm:text-4xl">Fed Up Privacy Policy</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Effective {effectiveDate}. Version {PRIVACY_POLICY_VERSION}.
              </p>
            </div>
          </div>
        </div>

        {consentRequired && (
          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Consent required</p>
            <p className="mt-1">
              Existing sessions must consent to the current policy before returning to the meal planner.
            </p>
          </section>
        )}

        <article className="mt-7 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-stone-950">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-stone-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <section className="mt-8 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => onAcceptedChange(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-700"
            />
            <span className="text-sm leading-6 text-stone-700">{PRIVACY_CONSENT_TEXT}</span>
          </label>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn("text-sm", accepted ? "text-emerald-700" : "text-stone-500")}>
              {accepted ? "Ready to record consent." : "Tick the box to continue."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AppButton type="button" disabled={!accepted} className="justify-center" onClick={onAccept}>
                <Check size={16} /> Consent and continue
              </AppButton>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
