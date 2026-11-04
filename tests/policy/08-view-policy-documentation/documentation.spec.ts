import { test, expect } from '../../../fixtures';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import type { PolicyDocumentsTab } from '../../../pages/policy/PolicyDocumentsTab';
import type { PolicyDocumentDrawer } from '../../../pages/policy/PolicyDocumentDrawer';
import { APPROVAL_STATE, CASES, DESCRIPTION, DUPLICATE_TITLE, TOO_LARGE, TOO_LONG } from '../../../data/policy/policyDocumentation.data';
import { DIALOG, FIELD_MESSAGE, OPTIONS, textOfLength } from '../../../data/policy/policy.data';
import { DEFAULT_VIEWPORT } from '../../../constants/BrowserConfig';
import { Timeouts } from '../../../constants/Timeouts';
import {
  addPolicyDocument,
  policyDayText,
  policyStamp,
  readPolicy,
  readPolicyDocuments,
  readPolicyVersions,
  samplePdf,
  type PolicyDocument,
} from '../../../utils/PolicyProvisioning';
import {
  attachmentDownload,
  documentEditControl,
  downloadFromCard,
  expectAccepted,
  expectRefused,
  pdfOfSize,
  refused,
  said,
  sampleDocx,
  sampleExe,
  samplePng,
  versionNumber,
} from '../../../utils/policy/writerBHelpers';

/** Opens the policy, its Documentation tab and the Add Documentation drawer. */
async function openAdd(detail: PolicyDetailPage, documents: PolicyDocumentsTab, policyId: string): Promise<PolicyDocumentDrawer> {
  await detail.open(policyId);
  await documents.open();
  return documents.openAdd();
}

/** A unique entry title. */
const titled = (label: string): string => `${label} ${policyStamp()}`;

/** The stored document with this title, if any. */
async function storedDocument(page: Parameters<typeof readPolicyDocuments>[0], policyId: string, title: string): Promise<PolicyDocument | undefined> {
  return (await readPolicyDocuments(page, policyId)).find((d) => d.title === title);
}

/**
 * User story 15175: View Policy - Documentation.
 * Titled, typed, dated documentation entries with an optional attachment, their
 * field rules, the approval path on a published policy, and who may change
 * them. The tab renders cards - see the data file for how the sheet's "table"
 * is read.
 */
test.describe('US 15175 - View Policy - Documentation', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.descriptionLength.azureId}: should save a 2,000-character description and never a 2,001-character one`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const max = CASES.descriptionLength.max;
    const policy = await policyIn('Draft');
    const [okTitle, overTitle] = [titled('Description Max'), titled('Description Over')];
    let drawer!: PolicyDocumentDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab and click Add Documentation - the add form opens', async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step(`Enter a Description of exactly ${max} characters with the other required fields, then save - the entry saves with the full description`, async () => {
      expectAccepted(await drawer.add({ title: okTitle, type: 'Other', description: textOfLength(max) }));
      expect((await storedDocument(page, policy.id, okTitle))?.description.length).toBe(max);
    });

    await steps.step(`Attempt to save another entry with a ${max + 1}-character description - saving is blocked with a maximum-length message`, async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      await drawer.fill({ title: overTitle, type: 'Other', description: textOfLength(max + 1) });
      const held = (await drawer.getValue('description')).length;
      const answer = await drawer.attemptSave();
      expect(refused(answer) && TOO_LONG.test(answer.messages.join(' ')) || held <= max, `held ${held} characters; save answered ${said(answer)}`).toBe(true);
      expect((await storedDocument(page, policy.id, overTitle))?.description.length ?? 0, `a ${max + 1}-character description stored`).toBeLessThanOrEqual(max);
    });
  });

  test(`TC-${CASES.titleLength.azureId}: should save a 250-character title and never a 251-character one`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const max = CASES.titleLength.max;
    const policy = await policyIn('Draft');
    const okTitle = `${titled('Title Max')} ${textOfLength(max)}`.slice(0, max);
    const overTitle = `${titled('Title Over')} ${textOfLength(max)}`.slice(0, max + 1);
    let drawer!: PolicyDocumentDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab and click Add Documentation - the add form opens', async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step(`Enter a Document Title of exactly ${max} characters with the other required fields, then save - the entry saves with the full title`, async () => {
      expectAccepted(await drawer.add({ title: okTitle, type: 'Other', description: DESCRIPTION }));
      expect((await storedDocument(page, policy.id, okTitle))?.title.length).toBe(max);
    });

    await steps.step(`Attempt to add another entry with a ${max + 1}-character title - saving is blocked with a maximum-length message`, async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      await drawer.fill({ title: overTitle, type: 'Other', description: DESCRIPTION });
      const held = (await drawer.getValue('title')).length;
      const answer = await drawer.attemptSave();
      expect(refused(answer) && TOO_LONG.test(answer.messages.join(' ')) || held <= max, `held ${held} characters; save answered ${said(answer)}`).toBe(true);
      expect((await readPolicyDocuments(page, policy.id)).filter((d) => d.title.length > max).map((d) => d.title.length), 'titles longer than 250 stored').toEqual([]);
    });
  });

  test(`TC-${CASES.addEntry.azureId}: should add a documentation entry with all its details and attachment`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.addEntry;
    const policy = await policyIn('Draft');
    const title = titled(data.title);
    const today = policyDayText(new Date());

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open a policy and go to the Documentation tab - it shows the existing list of entries', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.getAddAvailability()).toBe('available');
    });

    await steps.step(`Add "${data.title}" (${data.type}) with an effective date, a description and a PDF attachment - the entry is listed with Title, Type, Description, Effective Date, Created Date, User, Status, Approval Status and a download link`, async () => {
      const drawer = await policyDocumentsTab.openAdd();
      const answer = await drawer.add({ title, type: data.type, effectiveDate: today, description: data.description, attachment: pdfOfSize(data.bytes, data.file) });
      expect(answer.uploadStatus, 'the attachment upload').toBeLessThan(300);
      expectAccepted(answer);
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      const card = await policyDocumentsTab.readCard(title);
      expect({ title: card?.title, type: card?.type, description: card?.description }).toEqual({ title, type: data.type, description: data.description });
      expect(card?.meta ?? '', 'Effective Date, Created Date and User').toContain(today);
      expect({ status: (card?.state ?? '') !== '', approvalStatus: /Draft|Pending|Approved|Rejected/.test(card?.state ?? ''), download: card?.hasAttachmentLink })
        .toEqual({ status: true, approvalStatus: true, download: true });
    });
  });

  test(`TC-${CASES.allTypes.azureId}: should offer and save every document type`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    let drawer!: PolicyDocumentDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab and click Add Documentation - the add form opens', async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('Open the Document Type dropdown - it lists exactly Rider Addition, Coverage Change, Member Change, Premium Adjustment and Other', async () => {
      expect((await drawer.getTypeOptions()).map((o) => o.trim()).filter((o) => o !== '')).toEqual([...OPTIONS.documentType]);
      await drawer.cancel();
    });

    await steps.step('Select each value in turn, complete the other required fields and save an entry for each - each entry shows its selected type in the list', async () => {
      const saved: string[] = [];
      for (const type of OPTIONS.documentType) {
        const add = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
        const answer = await add.add({ title: titled(`Type ${type}`), type, description: DESCRIPTION });
        if (answer.status >= 200 && answer.status < 300) saved.push(type);
      }
      expect(saved).toEqual([...OPTIONS.documentType]);
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCards()).map((c) => c.type).sort()).toEqual([...OPTIONS.documentType].sort());
    });
  });

  test(`TC-${CASES.requiredFields.azureId}: should refuse to save documentation while any required field is missing`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const today = policyDayText(new Date());
    const required = { expectBlankRefused: async (field: (typeof CASES.requiredFields.fields)[number]): Promise<void> => {
      const title = titled(`Missing ${field}`);
      const before = (await readPolicyDocuments(page, policy.id)).length;
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      await drawer.fill({
        title: field === 'title' ? undefined : title,
        type: field === 'type' ? undefined : 'Other',
        effectiveDate: field === 'effectiveDate' ? '' : today,
        description: field === 'description' ? undefined : DESCRIPTION,
      });
      const answer = await drawer.attemptSave();
      expectRefused(answer, `a save without ${field}`);
      expect(await drawer.getFieldError(field), `the ${field} error`).not.toBe('');
      expect((await readPolicyDocuments(page, policy.id)).length, 'entries saved by this attempt').toBe(before);
      if (await drawer.isOpen()) await drawer.cancel();
    } };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Documentation tab and click Add Documentation - the add form opens', async () => {
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expect(await drawer.isOpen()).toBe(true);
      await drawer.cancel();
    });

    await steps.step('Leave Document Title blank, fill in the remaining fields, and attempt to save - a validation error is shown for the Title and nothing is saved', async () => {
      await required.expectBlankRefused('title');
    });

    await steps.step('Repeat leaving Document Type blank - a validation error is shown for the Type and nothing is saved', async () => {
      await required.expectBlankRefused('type');
    });

    await steps.step('Repeat leaving Effective Date blank - a validation error is shown for the Effective Date and nothing is saved', async () => {
      await required.expectBlankRefused('effectiveDate');
    });

    await steps.step('Repeat leaving Description blank - a validation error is shown for the Description and nothing is saved', async () => {
      await required.expectBlankRefused('description');
    });
  });

  test(`TC-${CASES.uniqueTitle.azureId}: should refuse a second documentation entry with the same title on one policy`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const title = CASES.uniqueTitle.title;
    const policy = await policyIn('Draft', { documents: [{ title, type: 'Coverage Change' }] });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the Documentation tab of the same policy - the existing entry "${title}" is listed`, async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCard(title))?.title).toBe(title);
    });

    await steps.step(`Click Add Documentation and enter the title "${title}" again with the other required fields, then save - the save is rejected with a message that the title must be unique for this policy`, async () => {
      const drawer = await policyDocumentsTab.openAdd();
      const answer = await drawer.add({ title, type: 'Other', description: DESCRIPTION });
      expectRefused(answer, 'a duplicate title');
      expect(said(answer)).toMatch(DUPLICATE_TITLE);
      expect((await readPolicyDocuments(page, policy.id)).filter((d) => d.title === title).length).toBe(1);
    });
  });

  test(`TC-${CASES.attachmentTypes.azureId}: should store PDF, Word and image attachments with a working download link`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const attachment = { expectStoredWithLink: async (label: string, file: ReturnType<typeof samplePdf>): Promise<void> => {
      const title = titled(label);
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      const answer = await drawer.add({ title, type: 'Other', description: DESCRIPTION, attachment: file });
      expect(answer.uploadStatus, `the ${label} upload`).toBeLessThan(300);
      expectAccepted(answer);
      const stored = await storedDocument(page, policy.id, title);
      expect(stored?.attachmentFileName).toBe(file.name);
      expect((await attachmentDownload(page, stored?.attachmentUri ?? '')).status, `GET of the stored ${label}`).toBe(200);
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCard(title))?.hasAttachmentLink, `a download link on the ${label} entry`).toBe(true);
    } };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Add Documentation with the required fields and a PDF under 10 MB, then save - the entry saves with a working download link for the PDF', async () => {
      await attachment.expectStoredWithLink('PDF', samplePdf('sample.pdf'));
    });

    await steps.step('Repeat attaching a Word document under 10 MB - the entry saves with a working download link for the Word file', async () => {
      await attachment.expectStoredWithLink('Word', sampleDocx('sample.docx'));
    });

    await steps.step('Repeat attaching an image file under 10 MB - the entry saves with a working download link for the image', async () => {
      await attachment.expectStoredWithLink('Image', samplePng('sample.png'));
    });
  });

  test(`TC-${CASES.unsupportedType.azureId}: should reject an unsupported attachment type`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const exe = sampleExe();

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step(`Add Documentation with the required fields and attach "${exe.name}", then save - the file is rejected with a message that the type is not supported`, async () => {
      const title = titled('Unsupported File');
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      await drawer.fill({ title, type: 'Other', description: DESCRIPTION, attachment: exe });
      const shown = [await drawer.getFieldError('attachment'), ...(await drawer.getMessages())].join(' | ');
      if (await drawer.isOpen()) await drawer.attemptSave();
      expect(shown).toContain(FIELD_MESSAGE.fileType);
      expect((await readPolicyDocuments(page, policy.id)).filter((d) => (d.attachmentFileName ?? '') === exe.name), 'entries stored with the .exe').toEqual([]);
    });
  });

  test(`TC-${CASES.attachmentSize.azureId}: should accept an attachment of exactly 10 MB and reject a larger one`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const limit = CASES.attachmentSize.limit;
    const policy = await policyIn('Draft');
    const exact = pdfOfSize(limit, 'file10MB.pdf');
    const over = pdfOfSize(limit + 1, 'file10MB_plus.pdf');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Add Documentation with the required fields and a file of exactly 10 MB, then save - the entry saves with the attachment retained', async () => {
      const title = titled('Exactly 10 MB');
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      const answer = await drawer.add({ title, type: 'Other', description: DESCRIPTION, attachment: exact });
      expect(answer.uploadStatus, 'the 10 MB upload').toBeLessThan(300);
      expectAccepted(answer);
      expect((await storedDocument(page, policy.id, title))?.attachmentFileName).toBe(exact.name);
    });

    await steps.step('Repeat with a file just over 10 MB - the attachment is rejected with a file-size message and the entry is not saved with it', async () => {
      const title = titled('Over 10 MB');
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      const upload = await drawer.fill({ title, type: 'Other', description: DESCRIPTION, attachment: over });
      const shown = [await drawer.getFieldError('attachment'), ...(await drawer.getMessages())].join(' | ');
      if (await drawer.isOpen()) await drawer.attemptSave();
      expect(`${shown} (upload answered ${upload})`).toMatch(new RegExp(`${FIELD_MESSAGE.fileTooLarge.replace(/\./g, '\\.')}|${TOO_LARGE.source}`, 'i'));
      expect((await readPolicyDocuments(page, policy.id)).filter((d) => d.attachmentFileName === over.name), 'entries stored with the over-size file').toEqual([]);
    });
  });

  test(`TC-${CASES.approvalProgress.azureId}: should move a documentation entry's approval status from Draft through Pending Approval to a decision`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const [first, second] = [titled('Approval Progress'), titled('Rejected Revision')];
    const stateOf = async (title: string): Promise<string> => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      return (await policyDocumentsTab.readCard(title))?.state ?? '(no entry)';
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab and view the newly created entry - its Approval Status shows "Draft"', async () => {
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expectAccepted(await drawer.add({ title: first, type: 'Coverage Change', description: DESCRIPTION }));
      expect(await stateOf(first)).toMatch(APPROVAL_STATE.draft);
    });

    await steps.critical('Submit the entry for approval - its Approval Status changes to "Pending Approval"', async () => {
      await policyDetailPage.open(policy.id);
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      expect(await stateOf(first)).toMatch(APPROVAL_STATE.pending);
    });

    await steps.step('Approve the entry as the second approver - its Approval Status changes to "Approved" and the version number increments', async () => {
      await policyApprovalsPage.approve(policy.nameEn);
      expect((await readPolicy(page, policy.id)).currentVersion).toBe(2);
      expect(await stateOf(first), 'the approved entry\'s Approval Status on its card (a live entry shows no status badge at all)').toMatch(APPROVAL_STATE.approved);
    });

    await steps.step('Create and submit a subsequent revision, then reject it as the second approver - its Approval Status changes to "Rejected" and the version reflects the rejected revision', async () => {
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      expectAccepted(await drawer.add({ title: second, type: 'Other', description: DESCRIPTION }));
      await policyDetailPage.open(policy.id);
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      await policyApprovalsPage.reject(policy.nameEn);
      const rejected = (await readPolicyVersions(page, policy.id)).find((v) => v.versionStatusCode === 'rejected');
      expect(rejected?.version, 'the rejected revision\'s version').toBe(3);
      expect(await stateOf(second), 'the rejected entry on the Documentation tab ("(no entry)" = it is no longer listed)').toMatch(APPROVAL_STATE.rejected);
      await policyDetailPage.open(policy.id);
      expect(versionNumber(await policyDetailPage.getVersionBadge())).toBeGreaterThanOrEqual(2);
    });
  });

  test(`TC-${CASES.listColumns.azureId}: should show every required piece of information for each documentation entry`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    steps,
  }) => {
    const title = titled('Columns Check');
    const policy = await policyIn('Draft', { documents: [{ title, type: 'Member Change', description: DESCRIPTION, attachment: samplePdf('columns.pdf') }] });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab - the documentation list loads', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.countCards()).toBeGreaterThan(0);
    });

    await steps.step('Verify the columns against the checklist - Title, Type, Description, Effective Date, Created Date, User, Status, Approval Status, the attachment link and Edit / Delete are present and populated', async () => {
      const card = await policyDocumentsTab.readCard(title);
      const document = policy.documents.find((d) => d.title === title);
      expect({
        title: card?.title === title,
        type: card?.type === 'Member Change',
        description: card?.description === DESCRIPTION,
        effectiveDate: (card?.meta ?? '').includes(policyDayText(document?.effectiveDate ?? new Date())),
        createdAndUser: (card?.meta ?? '').length > 10 && (card?.meta ?? '').includes(document?.createdByNameEn ?? '\u0000'),
        status: (card?.state ?? '') !== '',
        approvalStatus: /Draft|Pending|Approved|Rejected/.test(card?.state ?? ''),
        attachmentLink: card?.hasAttachmentLink === true,
        edit: await policyDocumentsTab.isEditOffered(title),
        delete: card?.deleteOffered === true,
      }).toEqual({ title: true, type: true, description: true, effectiveDate: true, createdAndUser: true, status: true, approvalStatus: true, attachmentLink: true, edit: true, delete: true });
    });
  });

  test(`TC-${CASES.editEntry.azureId}: should update a documentation entry's description and effective date`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyDocumentDrawer,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.editEntry;
    const title = titled('Editable Entry');
    const policy = await policyIn('Draft', { documents: [{ title, type: 'Rider Addition', description: DESCRIPTION }] });
    const newDate = policyDayText(new Date(Date.now() + data.effectiveInDays * 86_400_000));

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Documentation tab and click Edit on the existing entry - the edit form opens pre-filled with the current values', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.isEditOffered(title), 'an Edit action on the entry').toBe(true);
      await documentEditControl(policyDocumentsTab, title).click();
      await policyDocumentDrawer.waitForOpen();
      expect({ title: await policyDocumentDrawer.getValue('title'), description: await policyDocumentDrawer.getValue('description') }).toEqual({ title, description: DESCRIPTION });
    });

    await steps.step('Change the Description and Effective Date, then save - the list reflects the updated Description and Effective Date', async () => {
      expect(await policyDocumentDrawer.isOpen().catch(() => false), 'the edit form to change').toBe(true);
      await policyDocumentDrawer.typeDescription(data.description);
      await policyDocumentDrawer.typeEffectiveDate(newDate);
      await policyDocumentDrawer.attemptSave();
      const stored = (await readPolicyDocuments(page, policy.id)).find((d) => d.title === title);
      expect({ description: stored?.description, date: stored ? policyDayText(stored.effectiveDate) : '' }).toEqual({ description: data.description, date: newDate });
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCard(title))?.description).toBe(data.description);
    });
  });

  test(`TC-${CASES.deleteEntry.azureId}: should remove a documentation entry after its deletion is confirmed`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const title = CASES.deleteEntry.title;
    const policy = await policyIn('Draft', { documents: [{ title, type: 'Other', description: DESCRIPTION }] });
    let dialog!: Awaited<ReturnType<PolicyDocumentsTab['requestDelete']>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the Documentation tab and click Delete on "${title}" - a confirmation prompt is displayed`, async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      dialog = await policyDocumentsTab.requestDelete(title);
      expect(await dialog.getTitle()).toBe(DIALOG.deleteDocument.title);
      expect(await dialog.getMessage()).toBe(DIALOG.deleteDocument.message(title));
    });

    await steps.step('Confirm the deletion - the entry is removed from the documentation list', async () => {
      await dialog.confirmWithFollowUps();
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.readCard(title)).toBeUndefined();
      expect((await readPolicyDocuments(page, policy.id)).filter((d) => d.title === title && !/removal/i.test(d.state))).toEqual([]);
    });
  });

  test(`TC-${CASES.download.azureId}: should download the uploaded attachment unchanged`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const title = titled('Downloadable Rider');
    const file = samplePdf(CASES.download.file);
    const policy = await policyIn('Draft', { documents: [{ title, type: 'Rider Addition', description: DESCRIPTION, attachment: file }] });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Documentation tab - the entry shows a download link in its attachment column', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCard(title))?.hasAttachmentLink).toBe(true);
    });

    await steps.step('Click the attachment download link - the original file downloads and matches the uploaded file', async () => {
      const bytes = await downloadFromCard(page, policyDocumentsTab, title);
      expect(bytes, 'a file downloaded from the entry').not.toBeNull();
      expect(bytes?.equals(file.buffer), 'the downloaded file matches the upload').toBe(true);
    });
  });

  test(`TC-${CASES.removeAttachment.azureId}: should save an entry without the attachment that was removed before saving`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const title = titled('Attachment Removed');
    const file = samplePdf(CASES.removeAttachment.file);
    let drawer!: PolicyDocumentDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab, click Add Documentation, fill the required fields and attach a file - the file name appears with a remove action', async () => {
      drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      await drawer.fill({ title, type: 'Other', description: DESCRIPTION, attachment: file });
      expect(await drawer.isRemoveFileOffered()).toBe(true);
      expect(await drawer.getText()).toContain(file.name);
    });

    await steps.step('Click the remove action on the attachment, then save the entry - it saves with no attachment and no download link', async () => {
      await drawer.removeAttachment();
      // The file row leaves on the next render - read at once it was still there (2026-11-04 triage).
      await expect.poll(() => drawer.isRemoveFileOffered(), { timeout: Timeouts.short, message: 'the attachment (and its Remove) should leave the drawer' }).toBe(false);
      expectAccepted(await drawer.attemptSave());
      const stored = await storedDocument(page, policy.id, title);
      expect({ uri: stored?.attachmentUri ?? null, name: stored?.attachmentFileName ?? null }).toEqual({ uri: null, name: null });
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      expect((await policyDocumentsTab.readCard(title))?.hasAttachmentLink).toBe(false);
    });
  });

  test(`TC-${CASES.noAttachment.azureId}: should keep a documentation entry without an attachment stable across refreshes and window sizes`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const title = titled('No Attachment');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Documentation tab, click Add Documentation, and fill in Title, Type, Effective Date and Description only - all required fields are accepted', async () => {
      const drawer = await openAdd(policyDetailPage, policyDocumentsTab, policy.id);
      const answer = await drawer.add({ title, type: 'Premium Adjustment', effectiveDate: policyDayText(new Date()), description: DESCRIPTION });
      expectAccepted(answer);
      expect(answer.messages.filter((m) => /attachment/i.test(m)), 'attachment errors').toEqual([]);
    });

    await steps.step('Revisit the entry after a page refresh and under different window sizes - it persists with no attachment field errors', async () => {
      const seen: string[] = [];
      try {
        for (const size of CASES.noAttachment.viewports) {
          await page.setViewportSize(size);
          await policyDetailPage.open(policy.id);
          await page.reload();
          await policyDocumentsTab.open();
          const card = await policyDocumentsTab.readCard(title);
          seen.push(`${size.width}x${size.height}:${card ? `${card.title === title}/${card.hasAttachmentLink}` : 'missing'}`);
        }
      } finally {
        await page.setViewportSize(DEFAULT_VIEWPORT);
      }
      expect(seen).toEqual(CASES.noAttachment.viewports.map((s) => `${s.width}x${s.height}:true/false`));
      expect((await storedDocument(page, policy.id, title))?.attachmentUri ?? null).toBeNull();
    });
  });
});
