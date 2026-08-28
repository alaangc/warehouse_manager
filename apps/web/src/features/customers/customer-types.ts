export interface Customer {
  id: string;
  customerNumber: string;
  displayName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city: string;
  notes?: string | null;
  active: boolean;
  version: number;
}

export interface CustomerPrice {
  id: string;
  customerId: string;
  productId: string;
  unitPrice: string;
  validFrom: string;
  validTo: string | null;
  active: boolean;
}
