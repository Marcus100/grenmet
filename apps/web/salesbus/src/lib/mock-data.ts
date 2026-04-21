import type {
  Category,
  Customer,
  CustomerBalance,
  Payment,
  Product,
  Transaction,
} from "./types";

export const categories: Category[] = [
  {
    id: "drinks",
    name: "Drinks",
    image: "/images/categories/drinks.svg",
    description: "See all drinks that are available",
  },
  {
    id: "cigarette",
    name: "Cigarette",
    image: "/images/categories/cigarette.svg",
    description: "See all cigarette that are available",
  },
  {
    id: "paper",
    name: "Paper",
    image: "/images/categories/paper.svg",
    description: "See all paper that are available",
  },
];

export const products: Product[] = [
  {
    id: "caribe-1",
    name: "CARIBÉ",
    image: "/images/products/caribe.svg",
    halfCasePrice: 12,
    fullCasePrice: 24,
    category: "drinks",
  },
  {
    id: "stag-1",
    name: "STAG",
    image: "/images/products/stag.svg",
    halfCasePrice: 12,
    fullCasePrice: 24,
    category: "drinks",
  },
  {
    id: "star-malt-1",
    name: "STAR MALT",
    image: "/images/products/star-malt.svg",
    halfCasePrice: 12,
    fullCasePrice: 24,
    category: "drinks",
  },
  {
    id: "juicy-cool-1",
    name: "JUICY COOL",
    image: "/images/products/juicy-cool.svg",
    halfCasePrice: 12,
    fullCasePrice: 24,
    category: "drinks",
  },
  {
    id: "heineken-1",
    name: "HEINEKEN",
    image: "/images/products/heineken.svg",
    halfCasePrice: 14,
    fullCasePrice: 28,
    category: "drinks",
  },
  {
    id: "carib-can-1",
    name: "CARIBE",
    image: "/images/products/carib-can.svg",
    halfCasePrice: 10,
    fullCasePrice: 20,
    category: "drinks",
  },
  {
    id: "guinness-1",
    name: "GUINNESS",
    image: "/images/products/guinness.svg",
    halfCasePrice: 16,
    fullCasePrice: 32,
    category: "drinks",
  },
];

export const customers: Customer[] = [
  { id: "gary-stroude", name: "GARY STROUDE" },
  { id: "bradley", name: "BRADLEY" },
  { id: "eugene", name: "EUGENE" },
  { id: "jamal", name: "JAMAL" },
];

export const transactions: Transaction[] = [
  {
    id: "txn-1",
    customerId: "gary-stroude",
    customerName: "GARY STROUDE",
    date: "2025-01-21",
    paymentType: "cash",
    items: [
      {
        productId: "caribe-1",
        productName: "CARIBÉ",
        productImage: "/images/products/caribe.svg",
        quantity: 2,
        caseType: "1/2",
        price: 60,
      },
      {
        productId: "heineken-1",
        productName: "HEINEKEN",
        productImage: "/images/products/heineken.svg",
        quantity: 3,
        caseType: "full",
        price: 72,
      },
    ],
    total: 132,
  },
  {
    id: "txn-2",
    customerId: "gary-stroude",
    customerName: "GARY STROUDE",
    date: "2025-01-21",
    paymentType: "credit",
    items: [
      {
        productId: "caribe-1",
        productName: "CARIBÉ",
        productImage: "/images/products/caribe.svg",
        quantity: 2,
        caseType: "1/2",
        price: 48,
      },
      {
        productId: "caribe-1",
        productName: "CARIBÉ",
        productImage: "/images/products/caribe.svg",
        quantity: 1,
        caseType: "1/2",
        price: 12,
      },
      {
        productId: "heineken-1",
        productName: "HEINEKEN",
        productImage: "/images/products/heineken.svg",
        quantity: 3,
        caseType: "full",
        price: 56,
      },
    ],
    total: 116,
  },
  {
    id: "txn-3",
    customerId: "gary-stroude",
    customerName: "GARY STROUDE",
    date: "2025-01-21",
    paymentType: "cash",
    items: [
      {
        productId: "star-malt-1",
        productName: "STAR MALT",
        productImage: "/images/products/star-malt.svg",
        quantity: 4,
        caseType: "full",
        price: 96,
      },
    ],
    total: 96,
  },
];

export const payments: Payment[] = [
  {
    id: "pay-1",
    customerId: "gary-stroude",
    amount: 30,
    date: "2025-01-21",
  },
];

// Helper functions for mock data
export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductsByCategory(categoryId: string): Product[] {
  return products.filter((p) => p.category === categoryId);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getTransactionsByCustomer(customerId: string): Transaction[] {
  return transactions.filter((t) => t.customerId === customerId);
}

export function getTransactionsByDate(date: string): Transaction[] {
  return transactions.filter((t) => t.date === date);
}

export function getTransactionsByType(type: "cash" | "credit"): Transaction[] {
  return transactions.filter((t) => t.paymentType === type);
}

export function getPaymentsByCustomer(customerId: string): Payment[] {
  return payments.filter((p) => p.customerId === customerId);
}

export function getCustomerBalance(customerId: string): CustomerBalance {
  const customer = getCustomerById(customerId);
  const customerTransactions = getTransactionsByCustomer(customerId);
  const customerPayments = getPaymentsByCustomer(customerId);

  const totalOwed = customerTransactions
    .filter((t) => t.paymentType === "credit")
    .reduce((sum, t) => sum + t.total, 0);

  const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    customerId,
    customerName: customer?.name ?? "Unknown",
    totalOwed,
    totalPaid,
    currentBalance: totalOwed - totalPaid,
  };
}

export function getAllCustomerBalances(): CustomerBalance[] {
  return customers.map((c) => getCustomerBalance(c.id));
}

export function getTransactionSummary(date?: string) {
  const filteredTransactions = date
    ? getTransactionsByDate(date)
    : transactions;

  const allTotal = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
  const cashTotal = filteredTransactions
    .filter((t) => t.paymentType === "cash")
    .reduce((sum, t) => sum + t.total, 0);
  const creditTotal = filteredTransactions
    .filter((t) => t.paymentType === "credit")
    .reduce((sum, t) => sum + t.total, 0);

  return {
    all: allTotal,
    cash: cashTotal,
    credit: creditTotal,
    date: date ?? new Date().toISOString().split("T")[0],
  };
}
