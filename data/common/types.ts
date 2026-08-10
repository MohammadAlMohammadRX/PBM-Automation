/**
 * Shared TypeScript interfaces for test data. Keeping these centralized
 * means Page Objects, data factories, and tests all agree on shape.
 */

export type PayerType = 'Private' | 'Government' | 'Self-Insured';
export type EntityStatus = 'Active' | 'Inactive' | 'Pending' | 'Expired';

export interface PayerData {
  nameEn: string;
  nameAr: string;
  payerType: PayerType;
  licenseNumber: string;
  email: string;
  phoneNumber: string;
}

export type NetworkType = 'HMO' | 'EPO' | 'POS';

export interface NetworkData {
  nameEn: string;
  networkType: NetworkType;
  effectiveDate: string;
  expiryDate: string;
}

export type IdentityType = 'National ID' | 'Iqama (Residence Permit)';

export interface UserData {
  fullName: string;
  email: string;
  mobileNumber: string;
  documentId: string;
  identityType: IdentityType;
  nationality: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
}
