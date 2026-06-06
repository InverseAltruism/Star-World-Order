/**
 * Shared multi-step expedition adventures for Sanctuary V2 + V3.
 *
 * An "expedition" is a linked-step quest with narrative text and branching
 * choices. Where a normal {@link SanctuaryQuest} has a single counter that
 * ticks once per location visit, an expedition is a small interactive story
 * the player walks through inside an overlay: each step shows a paragraph of
 * narrative + 2–3 choices, each choice transitions to the next step (or
 * terminates the expedition). The terminal step carries an outcome label
 * (`success` | `partial` | `failure`) that scales the reward payout.
 *
 * This file is the *engine-agnostic contract*: pure data types + pure reducer
 * functions. Both V2 (cosmic placeholder) and V3 (Forgotten Memories) overlays
 * consume the same module — only rendering style differs. There is intentionally
 * NO Phaser, NO React, and NO database access here.
 *
 * Followups (separate PRs):
 *   - DB schema for `sanctuary_expeditions` + `sanctuary_expedition_progress`
 *     (mirrors the quest-progress pattern in lib/db.ts).
 *   - API route under `app/api/sanctuary/expeditions/`.
 *   - Overlay component `components/sanctuary/overlays/ExpeditionDialog.tsx`.
 */

export type ExpeditionOutcome = 'success' | 'partial' | 'failure';

export const EXPEDITION_OUTCOMES: readonly ExpeditionOutcome[] = [
  'success',
  'partial',
  'failure',
];

export type ExpeditionStatus = 'active' | 'completed' | 'abandoned';

export interface ExpeditionChoice {
  /** Stable ID, unique within the parent step. */
  id: string;
  /** Player-facing label shown on the choice button. */
  label: string;
  /**
   * ID of the step to transition to. If the parent step is terminal, the
   * `nextStepId` is ignored and the expedition ends with this choice's
   * `outcome`. For non-terminal steps, this MUST point to a real step id.
   */
  nextStepId?: string | null;
  /**
   * Optional flavor tag for analytics / personality (e.g. "diplomatic",
   * "reckless"). Not used by the reducer.
   */
  tone?: string;
  /**
   * Outcome to record when this choice ends the expedition (terminal steps
   * only). Ignored for non-terminal steps.
   */
  outcome?: ExpeditionOutcome;
}

export interface ExpeditionStep {
  /** Stable ID, unique within the parent expedition. */
  id: string;
  /** Narrative paragraph shown to the player when this step is current. */
  narrative: string;
  /** 1+ choices. UI typically renders 2–3; we don't cap here. */
  choices: ExpeditionChoice[];
  /**
   * If `true`, choosing any of `choices` ends the expedition with the
   * choice's `outcome` (defaulting to `'success'`). Non-terminal choices on
   * a terminal step are a definition error and rejected by
   * {@link validateExpeditionDefinition}.
   */
  isFinal?: boolean;
}

export interface ExpeditionRewards {
  xp: number;
  bond: number;
  /** Optional trait unlock awarded only on full success. */
  trait?: string | null;
}

export interface ExpeditionDefinition {
  /** Stable ID, unique across all expeditions. */
  id: string;
  title: string;
  /** Short pitch shown in the quest board / NPC dialog before launching. */
  description: string;
  /**
   * Quest source tag (matches `requirement_type` in `sanctuary_quests`, e.g.
   * `"observatory"`, `"forge"`). Used by the QuestBoard to attribute the
   * expedition to an NPC via `getQuestSource()`.
   */
  npcSource: string;
  /** Step that the expedition begins on. Must reference a step in `steps`. */
  startStepId: string;
  /** All steps in the expedition. Order is presentation-only. */
  steps: ExpeditionStep[];
  /**
   * Base rewards on full success. Partial outcomes scale by
   * {@link EXPEDITION_OUTCOME_REWARD_SCALE}.
   */
  rewards: ExpeditionRewards;
}

export interface ExpeditionHistoryEntry {
  stepId: string;
  choiceId: string;
  /** Outcome attached to the choice, if any (only meaningful for terminal). */
  outcome?: ExpeditionOutcome;
}

export interface ExpeditionState {
  expeditionId: string;
  /** ID of the step the player is currently on, or `null` if expedition ended. */
  currentStepId: string | null;
  status: ExpeditionStatus;
  history: ExpeditionHistoryEntry[];
  /** Final outcome — only set when `status === 'completed'`. */
  finalOutcome?: ExpeditionOutcome;
}

/**
 * Reward multipliers for each outcome. Tuned conservatively: a partial result
 * is worth half, a failure still pays out a token amount so playing through
 * is not punished into uselessness, and only `success` unlocks the trait.
 *
 * Frozen so callers can't accidentally mutate the table.
 */
export const EXPEDITION_OUTCOME_REWARD_SCALE: Readonly<Record<ExpeditionOutcome, number>> =
  Object.freeze({
    success: 1.0,
    partial: 0.5,
    failure: 0.25,
  });

// ---------------------------------------------------------------------------
// Definition validation
// ---------------------------------------------------------------------------

export interface ExpeditionValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Static validator for an expedition definition. Catches the structural bugs
 * that would only surface as a confusing UI failure mid-expedition (dangling
 * `nextStepId`, terminal step with no `outcome`, etc.). Call this from data
 * loaders and from tests when authoring new expeditions.
 */
export function validateExpeditionDefinition(
  def: ExpeditionDefinition,
): ExpeditionValidationResult {
  const errors: string[] = [];

  if (!def.id) errors.push('expedition.id is required');
  if (!def.title) errors.push('expedition.title is required');
  if (!def.npcSource) errors.push('expedition.npcSource is required');
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    errors.push('expedition.steps must be a non-empty array');
    return { ok: false, errors };
  }

  const stepIds = new Set<string>();
  for (const step of def.steps) {
    if (!step.id) {
      errors.push('step is missing id');
      continue;
    }
    if (stepIds.has(step.id)) {
      errors.push(`duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
    if (!Array.isArray(step.choices) || step.choices.length === 0) {
      errors.push(`step "${step.id}" must have at least one choice`);
      continue;
    }
    const choiceIds = new Set<string>();
    for (const choice of step.choices) {
      if (!choice.id) {
        errors.push(`step "${step.id}" has a choice missing id`);
        continue;
      }
      if (choiceIds.has(choice.id)) {
        errors.push(`step "${step.id}" has duplicate choice id: ${choice.id}`);
      }
      choiceIds.add(choice.id);
      if (step.isFinal) {
        if (!choice.outcome) {
          errors.push(
            `terminal step "${step.id}" choice "${choice.id}" must declare an outcome`,
          );
        }
      } else if (!choice.nextStepId) {
        errors.push(
          `non-terminal step "${step.id}" choice "${choice.id}" must declare nextStepId`,
        );
      }
    }
  }

  if (!stepIds.has(def.startStepId)) {
    errors.push(`startStepId "${def.startStepId}" does not match any step`);
  }

  // Cross-check nextStepId references against the resolved step set.
  for (const step of def.steps) {
    if (step.isFinal) continue;
    for (const choice of step.choices) {
      if (choice.nextStepId && !stepIds.has(choice.nextStepId)) {
        errors.push(
          `step "${step.id}" choice "${choice.id}" points to unknown step "${choice.nextStepId}"`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

function getStep(def: ExpeditionDefinition, stepId: string): ExpeditionStep | null {
  return def.steps.find((s) => s.id === stepId) ?? null;
}

/**
 * Look up the step the player is currently on. Returns `null` when the
 * expedition is no longer active (completed or abandoned).
 */
export function getCurrentStep(
  state: ExpeditionState,
  def: ExpeditionDefinition,
): ExpeditionStep | null {
  if (state.status !== 'active' || !state.currentStepId) return null;
  return getStep(def, state.currentStepId);
}

/**
 * Begin a new expedition session. Pure: returns the initial state, no I/O.
 */
export function startExpedition(def: ExpeditionDefinition): ExpeditionState {
  if (!getStep(def, def.startStepId)) {
    throw new Error(
      `cannot start expedition "${def.id}": startStepId "${def.startStepId}" not found`,
    );
  }
  return {
    expeditionId: def.id,
    currentStepId: def.startStepId,
    status: 'active',
    history: [],
  };
}

/**
 * Apply a choice to the current step. Pure: returns a new state object,
 * never mutates the input.
 *
 * Throws when the call is structurally invalid (wrong expedition, wrong
 * step, unknown choice id, expedition already ended). The caller is
 * expected to be the overlay layer which has direct access to the same
 * definition the state was produced from, so these are programmer errors,
 * not user-facing failures.
 */
export function chooseExpeditionPath(
  state: ExpeditionState,
  def: ExpeditionDefinition,
  choiceId: string,
): ExpeditionState {
  if (state.expeditionId !== def.id) {
    throw new Error(
      `expedition mismatch: state for "${state.expeditionId}" given def "${def.id}"`,
    );
  }
  if (state.status !== 'active' || !state.currentStepId) {
    throw new Error(`expedition "${state.expeditionId}" is not active`);
  }
  const step = getStep(def, state.currentStepId);
  if (!step) {
    throw new Error(
      `expedition "${def.id}" current step "${state.currentStepId}" not found`,
    );
  }
  const choice = step.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new Error(
      `expedition "${def.id}" step "${step.id}" has no choice "${choiceId}"`,
    );
  }

  const historyEntry: ExpeditionHistoryEntry = {
    stepId: step.id,
    choiceId: choice.id,
    outcome: choice.outcome,
  };
  const history = [...state.history, historyEntry];

  if (step.isFinal) {
    return {
      ...state,
      currentStepId: null,
      status: 'completed',
      history,
      finalOutcome: choice.outcome ?? 'success',
    };
  }

  if (!choice.nextStepId || !getStep(def, choice.nextStepId)) {
    throw new Error(
      `expedition "${def.id}" choice "${choice.id}" has invalid nextStepId`,
    );
  }

  return {
    ...state,
    currentStepId: choice.nextStepId,
    status: 'active',
    history,
  };
}

/**
 * Abandon an in-progress expedition. Idempotent on already-ended states —
 * abandoning a completed expedition leaves it completed (no silent reset).
 */
export function abandonExpedition(state: ExpeditionState): ExpeditionState {
  if (state.status !== 'active') return state;
  return {
    ...state,
    currentStepId: null,
    status: 'abandoned',
  };
}

export function isExpeditionComplete(state: ExpeditionState): boolean {
  return state.status === 'completed';
}

/**
 * Compute the reward payout for the player given a (typically completed)
 * expedition state. Scales the definition's base rewards by
 * {@link EXPEDITION_OUTCOME_REWARD_SCALE}; only `success` keeps the trait.
 *
 * Returns zeros for active or abandoned expeditions — the caller (claim API,
 * overlay) is responsible for not awarding mid-flight.
 */
export function getExpeditionRewards(
  state: ExpeditionState,
  def: ExpeditionDefinition,
): ExpeditionRewards {
  if (state.expeditionId !== def.id) {
    throw new Error(
      `expedition mismatch: state for "${state.expeditionId}" given def "${def.id}"`,
    );
  }
  if (state.status !== 'completed' || !state.finalOutcome) {
    return { xp: 0, bond: 0, trait: null };
  }
  const scale = EXPEDITION_OUTCOME_REWARD_SCALE[state.finalOutcome];
  return {
    xp: Math.round(def.rewards.xp * scale),
    bond: Math.round(def.rewards.bond * scale * 10) / 10,
    trait: state.finalOutcome === 'success' ? def.rewards.trait ?? null : null,
  };
}
