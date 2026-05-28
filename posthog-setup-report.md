<wizard-report>
# PostHog setup report

PostHog is initialized in `src/lib/posthog.ts` using `BUN_PUBLIC_POSTHOG_PROJECT_TOKEN` and `BUN_PUBLIC_POSTHOG_HOST`, with production build-time define injection in `build.ts`. The default ingestion host is `https://us.i.posthog.com` when no host is configured. The React entry point wraps the app in `PostHogProvider` and `PostHogErrorBoundary`.

The app imports PostHog's session replay recorder so it is bundled with the app instead of being loaded as a separate runtime dependency. Session recording starts from the SDK `loaded` hook with ingestion controls overridden.

The app registers the existing anonymous prototype session ID with PostHog at startup. The same ID is also registered as the `anonymous_session_id` super property, so manual captures include it on every event.

## Enabled PostHog Features

| Feature | Configuration |
|---|---|
| Session replay | Enabled with `disable_session_recording: false`; the replay recorder is bundled locally and `startSessionRecording(true)` runs after the SDK loads. |
| Replay privacy | All inputs are masked, text can be masked with `[data-ph-mask]`, full nodes can be blocked with `[data-ph-block]`, and request/response headers and bodies are removed from replay network captures. |
| Autocapture | Explicitly enabled for click, change, and submit events on links, buttons, forms, inputs, selects, textareas, and labels. |
| Rage clicks | Enabled with three clicks within 1000ms and a 30px threshold. |
| Dead clicks | Enabled through `capture_dead_clicks`. |
| Heatmaps | Enabled through `capture_heatmaps`. |
| Performance | Network timing and web vitals enabled through `capture_performance`. |
| Exceptions | Enabled through `capture_exceptions` and the React `PostHogErrorBoundary`. |
| Page tracking | History-change pageviews and pageleave events enabled. |
| Data protection | Personal URL properties are masked and raw postcode/sessionId properties are denied. |

## Journey Dimensions

The prototype registers dynamic super properties so manual events, autocapture, heatmaps, replay-linked events, rage clicks, and dead clicks can be sliced by user journey state:

- `current_screen`
- `prototype_onboarded`
- `deadline_count`
- `custom_recipe_count`
- `selected_source_count`
- `budget_band`
- `kitchen_access`
- `max_time_bucket`
- `dietary_count`
- `allergen_count`
- `dislike_count`
- `like_count`

## Instrumented Events

| Event | Description |
|---|---|
| `prototype_screen_viewed` | Screen changes in the prototype flow. |
| `navigation_clicked` | Header, settings, desktop nav, and mobile nav clicks. |
| `deadline_mode_started` | Landing page setup/demo CTA clicks. |
| `calendar_source_selected` | Google Calendar or `.ics` import option selection. |
| `ics_calendar_imported` | `.ics` upload parsed, including imported event count. |
| `onboarding_step_completed` | Onboarding forward-step clicks. |
| `onboarding_step_back_clicked` | Onboarding back-step clicks. |
| `onboarding_preference_changed` | Major onboarding preference changes. |
| `onboarding_choice_toggled` | Dietary, allergy, liked food, and disliked ingredient toggles. |
| `onboarding_custom_choice_added` | Custom onboarding preference chips added. |
| `recipe_source_toggled` | Recipe source enable/disable interactions. |
| `onboarding_completed` | Final onboarding completion with preference summary properties. |
| `dashboard_full_plan_clicked` | Dashboard CTA to view the full plan. |
| `dashboard_calendar_clicked` | Dashboard calendar shortcut. |
| `calendar_manage_import_clicked` | Calendar screen import management CTA. |
| `find_alternatives_clicked` | Plan screen alternatives CTA. |
| `recipe_viewed` | Recipe detail opens, with meal ID and source screen. |
| `meal_swap_started` | Plan rescue/swap chooser opened. |
| `meal_swap_cancelled` | Swap chooser closed or original meal kept. |
| `meal_swap_confirmed` | Swap confirmed with original/replacement meal IDs. |
| `discover_recipe_swiped` | Discover card accepted or rejected. |
| `discover_recipe_added_to_plan` | Liked recipe inserted into the plan. |
| `discover_queue_restarted` | Discover suggestions reset. |
| `custom_recipe_added` | User-created recipe saved. |
| `recipe_edit_started` | Recipe edit mode opened. |
| `recipe_edit_cancelled` | Recipe edit cancelled. |
| `recipe_saved` | Recipe edits saved. |
| `recipe_review_submitted` | Recipe review submitted. |
| `recipe_back_to_plan_clicked` | Recipe detail back-to-plan click. |
| `settings_preference_changed` | Major settings preference changes. |
| `settings_choice_toggled` | Settings dietary/allergy/like/dislike toggles. |
| `settings_custom_choice_added` | Custom settings preference chips added. |
| `settings_reimport_clicked` | Settings `.ics` re-import CTA. |
| `settings_saved` | Settings saved back to dashboard. |
| `constraints_submitted` | Legacy React Router setup form submitted. |
| `strategy_selected` | Legacy React Router strategy selected. |
| `rescue_confirmed` | Legacy React Router rescue swap confirmed. |

</wizard-report>
