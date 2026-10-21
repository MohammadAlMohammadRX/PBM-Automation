/**
 * The Azure DevOps ids, for the Node scripts (report, register, publisher).
 *
 * ONE SOURCE. data/azureTestIds.data.ts is where the folder -> User Story and
 * case -> Test Case ids are kept for the suite; the scripts are plain Node and
 * cannot import TypeScript, so this reads the story map out of that file
 * rather than keeping a second copy that could drift.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'data', 'azureTestIds.data.ts');
const ORG = process.env.AZURE_DEVOPS_ORG || 'neomatixco';
const PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'CareConnect';

/** Link to a work item (user story or test case) in Azure Boards. */
const workItemUrl = (id) => `https://dev.azure.com/${ORG}/${PROJECT}/_workitems/edit/${id}`;

let cache = null;

/** Folder prefix ("01") -> { id, title }, read from the AZURE_STORY map. */
function azureStories() {
  if (cache) return cache;
  const src = fs.readFileSync(SOURCE, 'utf8');
  const block = src.slice(src.indexOf('export const AZURE_STORY'), src.indexOf('export const AZURE_UNMAPPED_FOLDERS'));
  cache = {};
  // Titles may carry an escaped apostrophe ("a User\'s Assigned Scope").
  for (const m of block.matchAll(/'(\d\d)':\s*\{\s*id:\s*'(\d+)',\s*title:\s*'((?:\\'|[^'])*)'\s*\}/g)) {
    cache[m[1]] = { id: m[2], title: m[3].replace(/\\'/g, "'") };
  }
  return cache;
}

/** The Azure User Story of a story folder ("01-create-...") or prefix ("01"), or null. */
const storyOfFolder = (folder) => azureStories()[String(folder || '').slice(0, 2)] || null;

/** The Azure User Story whose title (or folder story name) matches, or null. */
function storyOfName(name) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const want = norm(name);
  return Object.values(azureStories()).find((s) => norm(s.title) === want) || null;
}

module.exports = { azureStories, storyOfFolder, storyOfName, workItemUrl, ORG, PROJECT };
