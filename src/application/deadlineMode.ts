import { validateConstraints } from "@/domain/constraints";
import { generatePlan } from "@/domain/planGenerator";
import { rankStrategies } from "@/domain/recommendationRules";
import { applyRescueSwap, findRescueOptions } from "@/domain/rescuePlanner";
import type {
  DeadlineBootstrap,
  MealOption,
  PlanningConstraints,
  PlanStrategy,
  DeadlineEvent,
  RankedStrategy,
  RescueProposal,
  WeeklyPlan,
} from "@/domain/types";

export type DeadlineModeState = {
  meals: MealOption[];
  canonicalConstraints: PlanningConstraints | null;
  app: DeadlineBootstrap["app"] | null;
  constraints: PlanningConstraints | null;
  rankedStrategies: RankedStrategy[];
  recommendedStrategy: PlanStrategy | null;
  selectedStrategy: PlanStrategy | null;
  activePlan: WeeklyPlan | null;
  rescueCandidates: RescueProposal[];
  currentRescueDayId: string | null;
  validationErrors: string[];
  events: DeadlineEvent[];
  bootstrapped: boolean;
  bootstrapError: string | null;
};

export type DeadlineModeInternalAction =
  | { type: "bootstrap_loaded"; bootstrap: DeadlineBootstrap }
  | { type: "bootstrap_failed"; message: string };

export type DeadlineModeAction = DeadlineEvent | DeadlineModeInternalAction;

export const initialDeadlineModeState: DeadlineModeState = {
  meals: [],
  canonicalConstraints: null,
  app: null,
  constraints: null,
  rankedStrategies: [],
  recommendedStrategy: null,
  selectedStrategy: null,
  activePlan: null,
  rescueCandidates: [],
  currentRescueDayId: null,
  validationErrors: [],
  events: [],
  bootstrapped: false,
  bootstrapError: null,
};

function withEvent(state: DeadlineModeState, event: DeadlineEvent, changes: Partial<DeadlineModeState>): DeadlineModeState {
  return {
    ...state,
    ...changes,
    events: [...state.events, event],
  };
}

export function deadlineModeReducer(
  state: DeadlineModeState,
  action: DeadlineModeAction,
): DeadlineModeState {
  switch (action.type) {
    case "bootstrap_loaded": {
      return {
        ...state,
        meals: action.bootstrap.meals,
        canonicalConstraints: action.bootstrap.canonicalConstraints,
        app: action.bootstrap.app,
        constraints: state.constraints ?? action.bootstrap.canonicalConstraints,
        rankedStrategies: rankStrategies(state.constraints ?? action.bootstrap.canonicalConstraints, action.bootstrap.meals),
        recommendedStrategy: rankStrategies(state.constraints ?? action.bootstrap.canonicalConstraints, action.bootstrap.meals)[0]?.strategy ?? null,
        bootstrapped: true,
        bootstrapError: null,
      };
    }

    case "bootstrap_failed":
      return { ...state, bootstrapped: true, bootstrapError: action.message };

    case "deadline_mode_started":
      return withEvent(state, action, {});

    case "constraints_submitted": {
      const validation = validateConstraints(action.constraints);
      const rankedStrategies = validation.valid ? rankStrategies(action.constraints, state.meals) : [];

      return withEvent(state, action, {
        constraints: action.constraints,
        rankedStrategies,
        recommendedStrategy: rankedStrategies[0]?.strategy ?? null,
        selectedStrategy: null,
        activePlan: null,
        rescueCandidates: [],
        currentRescueDayId: null,
        validationErrors: validation.errors,
      });
    }

    case "strategy_viewed":
      return withEvent(state, action, {});

    case "strategy_selected":
      return withEvent(state, action, {
        selectedStrategy: action.strategy,
        rescueCandidates: [],
        currentRescueDayId: null,
      });

    case "plan_generated":
      return withEvent(state, action, {
        activePlan: action.plan,
        selectedStrategy: action.plan.strategy,
        rescueCandidates: [],
        currentRescueDayId: null,
      });

    case "rescue_started":
      return withEvent(state, action, {
        rescueCandidates: action.proposals,
        currentRescueDayId: action.dayId,
      });

    case "rescue_confirmed":
      return withEvent(state, action, {
        activePlan: action.plan,
        rescueCandidates: [],
        currentRescueDayId: null,
      });

    case "constraints_edited":
      return withEvent(state, action, {
        selectedStrategy: null,
        activePlan: null,
        rescueCandidates: [],
        currentRescueDayId: null,
      });
  }
}

export type DeadlineModeCommands = {
  startDeadlineMode: () => void;
  submitConstraints: (constraints: PlanningConstraints) => boolean;
  viewStrategies: () => void;
  selectStrategy: (strategy: PlanStrategy) => void;
  startRescue: (dayId: string) => RescueProposal[];
  confirmRescue: (proposal: RescueProposal) => void;
  editConstraints: () => void;
};

function eventTime() {
  return new Date().toISOString();
}

export function createDeadlineModeCommands(
  getState: () => DeadlineModeState,
  publish: (event: DeadlineEvent) => void,
): DeadlineModeCommands {
  return {
    startDeadlineMode() {
      publish({ type: "deadline_mode_started", occurredAt: eventTime() });
    },
    submitConstraints(constraints) {
      const validation = validateConstraints(constraints);
      publish({ type: "constraints_submitted", occurredAt: eventTime(), constraints });
      return validation.valid;
    },
    viewStrategies() {
      publish({ type: "strategy_viewed", occurredAt: eventTime() });
    },
    selectStrategy(strategy) {
      const state = getState();
      const constraints = state.constraints ?? state.canonicalConstraints;

      if (constraints === null) return;

      const plan = generatePlan(constraints, strategy, state.meals);
      publish({ type: "strategy_selected", occurredAt: eventTime(), strategy });
      publish({ type: "plan_generated", occurredAt: eventTime(), plan });
    },
    startRescue(dayId) {
      const state = getState();
      const proposals = state.activePlan === null ? [] : findRescueOptions(state.activePlan, dayId, state.meals);

      publish({ type: "rescue_started", occurredAt: eventTime(), dayId, proposals });
      return proposals;
    },
    confirmRescue(proposal) {
      const state = getState();

      if (state.activePlan === null) return;

      const plan = applyRescueSwap(state.activePlan, proposal);
      publish({
        type: "rescue_confirmed",
        occurredAt: eventTime(),
        dayId: proposal.dayId,
        replacementMealId: proposal.replacement.id,
        plan,
      });
    },
    editConstraints() {
      publish({ type: "constraints_edited", occurredAt: eventTime() });
    },
  };
}
