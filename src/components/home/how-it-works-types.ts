/** One step in the home "How it works" story. Illustrations stay SVG/light. */
export type HowStepIllustration = 'questions' | 'matches' | 'file';

export interface HowStep {
  title: string;
  body: string;
  points: string[];
  illustration: HowStepIllustration;
}
