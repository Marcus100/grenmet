"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { CustomerCard } from "@/components/settlements";
import { Button, SearchBar } from "@/components/ui";
import { getAllCustomerBalances } from "@/lib/mock-data";

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const customerBalances = getAllCustomerBalances();

  const filteredCustomers = customerBalances.filter((customer) =>
    customer.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:gap-5 sm:p-5">
      {/* Header with search and add button */}
      <div className="flex gap-3">
        <SearchBar
          className="flex-1"
          onSearch={setSearchQuery}
          placeholder="Search customers..."
          value={searchQuery}
        />
        <Button
          className="flex items-center gap-2 whitespace-nowrap"
          variant="primary"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Add Person</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Customer list - 2 columns on tablet landscape */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 landscape:grid-cols-2">
        {filteredCustomers.map((customer) => (
          <CustomerCard customer={customer} key={customer.customerId} />
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-base sm:text-lg">No customers found</p>
        </div>
      )}
    </div>
  );
}
