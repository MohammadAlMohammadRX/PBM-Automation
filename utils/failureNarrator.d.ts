/** Types for failureNarrator.js - the plain-language failure wording every report uses. */

export interface NarratedStep {
  index: number;
  /** The step as named in the test. */
  step: string;
  /** What the step did (the part before " - "). */
  action: string;
  /** What should have happened. */
  expected: string;
  /** What actually happened, in plain words. */
  actual: string;
  /** What the application showed during the step (messages, pop-ups, refusals). */
  screen: string[];
}

export interface StepLike {
  index: number;
  name: string;
  reason?: string;
  observed?: { events: string[] };
}

export function describeId(id: string): string;
export function elementOf(message: string): string;
export function narrateActual(reason: string | undefined): string;
export function narrateExpected(stepName: string): { action: string; expected: string };
export function narrateScreen(events: string[] | undefined): string[];
export function narrateStep(step: StepLike): NarratedStep;
export function narrateText(step: StepLike): string;
export function serverMessage(text: string): { status?: number; said: string };
export function stepHeading(n: { index: number; action: string; expected: string }): string;
