import { describe, it, expect } from 'vitest';
import { scheduleJobs, Job } from '../index';

const exampleJob: Job = {
  name: 'Deploy (fallctf.com)',
  'runs-on': 'ubuntu-latest',
  permissions: {
    contents: 'read',
    deployments: 'write',
  },
  steps: [
    {
      name: 'Check out repository code',
      uses: 'actions/checkout@v3',
      with: {
        submodules: true,
        'fetch-depth': 0,
      },
    },
    {
      name: 'Build 2023 mdbook',
      uses: './.github/actions/build-mdbook',
      with: {
        'book-directory': 'fallctf-2023',
      },
    },
    {
      name: 'Build 2024 mdbook',
      uses: './.github/actions/build-mdbook',
      with: {
        'book-directory': 'fallctf-2024',
      },
    },
    {
      name: 'Build site',
      uses: './.github/actions/build-astro',
      with: {
        'working-directory': '${{ env.CI_WORKING_DIR }}',
        'build-directory': '${{ env.CI_BUILD_DIR }}',
        'cache-directory': '${{ env.CI_CACHE_DIR }}',
      },
    },
    {
      name: 'Deploy to Cloudflare Pages',
      if: "github.actor != 'dependabot[bot]'",
      uses: 'cloudflare/pages-action@v1',
      with: {
        apiToken: '${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}',
        accountId: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
        projectName: '${{ vars.CLOUDFLARE_PROJECT_NAME_FALLCTF }}',
        gitHubToken: '${{ secrets.GITHUB_TOKEN }}',
        workingDirectory: '${{ env.CI_WORKING_DIR }}',
        directory: '${{ env.CI_BUILD_DIR }}',
      },
    },
  ],
};
describe('add', () => {
  it('should add two numbers', async () => {
    scheduleJobs([
      { time: new Date('2021-01-01T00:00:00Z'), ...exampleJob },
    ], {
      'path': 'workflow.yml',
      'check': false,
      'merge': false,
    })
  });
});