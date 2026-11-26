import { describe, expect, it } from 'vitest';
import { WE_FILE_THIS_CLAIM, WE_HELP_YOU_FILE } from '@/lib/copy';
import { settlementHowToJsonLd, settlementHowToSteps } from '@/lib/settlement-howto';
import { makeLawsuit } from './helpers';

describe('settlement HowTo steps and JSON-LD', () => {
  it('uses “We file this claim for you” only in the agent lane', () => {
    const agent = settlementHowToSteps('agent');
    expect(agent.map((s) => s.name)).toEqual([
      'Check that you qualify',
      WE_FILE_THIS_CLAIM,
      'Keep track in Lawsuit AI',
    ]);
    expect(agent[1]?.text).toMatch(/We file this claim for you after you review and sign it/);

    const self = settlementHowToSteps('self_file');
    expect(self[1]?.name).toBe(WE_HELP_YOU_FILE);
    expect(`${self[1]?.name} ${self[1]?.text}`).not.toMatch(/we file this claim for you/i);

    const never = settlementHowToSteps('never_files');
    expect(never[1]?.name).toBe(WE_HELP_YOU_FILE);
    expect(`${never[1]?.name} ${never[1]?.text}`).not.toMatch(/we file this claim for you/i);
  });

  it('emits HowTo JSON-LD without inventing payouts or agent copy on a self-file page', () => {
    const lawsuit = makeLawsuit(
      {},
      { slug: 'quiet-settlement', title: 'Quiet Settlement', deadline: '2027-01-15' },
    );
    const data = settlementHowToJsonLd(lawsuit, 'self_file');
    expect(data['@type']).toBe('HowTo');
    expect(JSON.stringify(data)).toContain('How to file a claim for the Quiet Settlement');
    expect(JSON.stringify(data)).not.toMatch(/we file this claim for you/i);
    expect(JSON.stringify(data)).not.toMatch(/testimonial|15%/i);
    expect(data.step).toHaveLength(3);
    expect(data.step[0]).toMatchObject({ '@type': 'HowToStep', position: 1 });

    const agent = settlementHowToJsonLd(lawsuit, 'agent');
    expect(JSON.stringify(agent)).toMatch(/We file this claim for you/);

    const never = settlementHowToJsonLd(lawsuit, 'never_files');
    expect(JSON.stringify(never)).not.toMatch(/we file this claim for you/i);
  });

  it('Easy submit how-to is only for an approved agent lane, not a draft desk_file', () => {
    const draft = settlementHowToSteps('self_file', true);
    expect(draft[1]?.name).toBe(WE_HELP_YOU_FILE);
    expect(`${draft[1]?.name} ${draft[1]?.text}`).not.toMatch(/Easy submit/i);

    const never = settlementHowToSteps('never_files', true);
    expect(never[1]?.name).toBe(WE_HELP_YOU_FILE);
    expect(JSON.stringify(settlementHowToJsonLd(makeLawsuit({}, { slug: 'rolling-stone-magazine-lifetime-subscription', title: 'Rolling Stone' }), 'never_files', true))).not.toMatch(/Easy submit/i);

    const approved = settlementHowToSteps('agent', true);
    expect(approved[1]?.name).toBe('Easy submit');
    expect(approved[1]?.text).toMatch(/Easy submit on eligible claims/);
    const json = settlementHowToJsonLd(makeLawsuit({}, { slug: 'realpage-rental-software-antitrust-settlement', title: 'RealPage' }), 'agent', true);
    expect(JSON.stringify(json)).toContain('Easy submit');
    expect(JSON.stringify(json)).not.toMatch(/doesn['’]t file claims for you|never files for you/i);
  });
});
