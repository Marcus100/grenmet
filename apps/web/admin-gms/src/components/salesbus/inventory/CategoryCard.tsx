"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/salesbus/types";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link
      className="flex min-h-16 touch-manipulation items-center gap-4 rounded-xl bg-card p-3 transition-all hover:shadow-gm-card active:bg-gray-50 sm:p-4"
      href={`/salesbus/inventory/${category.id}`}
    >
      <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-24 sm:w-32">
        <Image
          alt={category.name}
          className="h-full w-full object-cover"
          height={96}
          src={category.image}
          width={128}
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold text-foreground text-lg sm:text-xl">
          {category.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm sm:text-base">
          {category.description}
        </p>
      </div>

      <ChevronRight className="h-6 w-6 flex-shrink-0 text-muted-foreground" />
    </Link>
  );
}
