import { test as base } from '@playwright/test';
import { AZURE_STORY } from '../data/azureTestIds.data';

const ORG = process.env.AZURE_DEVOPS_ORG || 'neomatixco';
const PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'CareConnect';
const workItemUrl = (id: string): string => `https://dev.azure.com/${ORG}/${PROJECT}/_workitems/edit/${id}`;

/**
 * Stamps every payer test with its Azure DevOps ids (2026-10-12).
 *
 * TRACEABILITY IN THE RESULT ITSELF. The story folder names the Azure User
 * Story (via AZURE_STORY) and the title's leading number is the Azure Test
 * Case; both are added as annotations, so Playwright's own report and the
 * results JSON carry them next to each result. Automatic - no spec changes,
 * and nothing about how a test runs or is judged changes.
 */
export const test = base.extend<{ azureTrace: void }>({
  azureTrace: [
    async ({}, use, testInfo) => {
      const parts = testInfo.file.split(/[\\/]/);
      const payerAt = parts.lastIndexOf('payer');
      const folder = payerAt >= 0 ? parts[payerAt + 1] ?? '' : '';
      const story = AZURE_STORY[folder.slice(0, 2)];
      if (story) {
        testInfo.annotations.push({ type: 'Azure User Story', description: `${story.id} ${story.title} - ${workItemUrl(story.id)}` });
      }
      const testCase = /^(\d{5}):/.exec(testInfo.title)?.[1];
      if (testCase) {
        testInfo.annotations.push({ type: 'Azure Test Case', description: `${testCase} - ${workItemUrl(testCase)}` });
      }
      await use();
    },
    { auto: true },
  ],
});
