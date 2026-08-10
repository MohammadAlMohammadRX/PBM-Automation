import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { UserCreateDialog } from './UserCreateDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Logger } from '../../utils/Logger';
import type { UserData } from '../../data/common/types';

/**
 * Page Object for Users Administration (/users-management/users-administration).
 * Verified against the live app: search box, "Add User" button, data table
 * with columns Name / Document ID / Nationality / Identity Type / Mobile
 * Number / Status / Actions, and row actions View / Edit / Assign Roles &
 * Payers / Inactive-Active toggle / Delete.
 */
export class UsersAdministrationPage extends ListPageBase {
  constructor(page: Page) {
    super(page, 'Add User');
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.usersAdministration);
  }

  async startCreateUser(user: UserData): Promise<UserCreateDialog> {
    Logger.step(`Creating user "${user.fullName}"`);
    await this.clickAdd();
    const dialog = new UserCreateDialog(this.page);
    await dialog.verifyStepHeadingVisible('Add New User');
    await dialog.fillUserInformation(user);
    return dialog;
  }

  async searchUser(term: string): Promise<void> {
    await this.search(term);
  }

  async deleteUser(fullName: string): Promise<void> {
    await this.deleteRow(fullName);
  }

  async editUser(fullName: string): Promise<void> {
    await this.editRow(fullName);
  }

  async toggleUserActiveState(fullName: string): Promise<void> {
    const row = this.rowByText(fullName);
    await row.getByRole('button', { name: /^(Active|Inactive)$/ }).click();
  }

  async verifyUserDetails(fullName: string, expected: Partial<Record<string, string>>): Promise<void> {
    await this.waitForRowVisible(fullName);
    for (const [column, expectedValue] of Object.entries(expected)) {
      const actual = await this.getRowCellValue(fullName, column);
      expect(actual, `Column "${column}" for user "${fullName}"`).toBe(expectedValue);
    }
  }
}
