export type CaseType = "full" | "3/4" | "1/2" | "1/4";

export type PaymentType = "cash" | "credit";

export interface Product {
  id: string;
  name: string;
  image: string;
  halfCasePrice: number;
  fullCasePrice: number;
  category: string;
}

export interface Category {
  id: string;
  name: string;
  image: string;
  description: string;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  caseType: CaseType;
  price: number;
}

export interface Customer {
  id: string;
  name: string;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  productImage: string;
  quantity: number;
  caseType: CaseType;
  price: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  items: TransactionItem[];
  paymentType: PaymentType;
  total: number;
}

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  totalOwed: number;
  totalPaid: number;
  currentBalance: number;
}

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  date: string;
}

export function getCasePrice(product: Product, caseType: CaseType): number {
  switch (caseType) {
    case "full":
      return product.fullCasePrice;
    case "3/4":
      return product.fullCasePrice * 0.75;
    case "1/2":
      return product.halfCasePrice;
    case "1/4":
      return product.halfCasePrice * 0.5;
    default:
      return product.fullCasePrice;
  }
}

export function formatCaseType(caseType: CaseType): string {
  switch (caseType) {
    case "full":
      return "full case";
    case "3/4":
      return "3/4 case";
    case "1/2":
      return "half case";
    case "1/4":
      return "1/4 case";
    default:
      return caseType;
  }
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  
  const day = date.getDate();
  const suffix = getOrdinalSuffix(day);
  
  const formatted = date.toLocaleDateString("en-US", options);
  return formatted.replace(/\d+/, `${day}${suffix}`);
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

