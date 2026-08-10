import type { Page } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import type { UserData } from '../../data/common/types';

/**
 * "Add New User" wizard side-panel (3 steps: User Information, Contact
 * Information, Roles and Privileges). Step 1 fields verified against the
 * live application; steps 2-3 are extension points (same pattern applies).
 */
export class UserCreateDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, 'user-dialog');
  }

  async fillUserInformation(user: UserData): Promise<void> {
    const [firstName, ...rest] = user.fullName.split(' ');
    const lastName = rest.length > 0 ? rest[rest.length - 1] : firstName;

    await this.fillTextField('First Name', firstName);
    await this.fillTextField('Last Name', lastName);
    await this.fillTextField('Document ID', user.documentId);
    await this.selectDropdownOption('Nationality', user.nationality).catch(() => undefined);
    await this.selectDropdownOption('Identity Type', user.identityType).catch(() => undefined);
  }

  async proceedToContactInformation(): Promise<void> {
    await this.clickNext();
  }
}
