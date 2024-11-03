import { describe, it, expect } from 'vitest';
import { generateWorkflow } from '../index';

describe('empty', () => {
  it('if no jobs are passed, no scheduled cron jobs', async () => {
    const result = await generateWorkflow([], false);
    const correct = {
      name: "Scheduled Jobs",
      on: {
        workflow_dispatch: {},
      },
      jobs: {},
    };
    expect(result).toEqual(correct);
  });
});