import type { Screen } from './DeviceFrame';

export interface HowStep {
  title: string;
  body: string;
  points: string[];
  screen: Screen;
}
