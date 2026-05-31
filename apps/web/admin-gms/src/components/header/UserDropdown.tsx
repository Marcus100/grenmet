"use client";
import { useSessionUser } from "@grenmet/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import { signOut, signOutEverywhere } from "@/lib/auth";

export default function UserDropdown() {
  const user = useSessionUser();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center text-gray-700"
        type="button"
      >
        <span className="mr-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gray-200 font-semibold text-gray-600">
          {(user.full_name ?? user.email).charAt(0).toUpperCase()}
        </span>
        <span className="mr-1 block font-medium text-theme-sm">
          {user.full_name ?? user.email}
        </span>
        <svg
          aria-hidden="true"
          className="stroke-gray-500"
          fill="none"
          height="20"
          viewBox="0 0 18 20"
          width="18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[260px] rounded-2xl p-3">
        <div className="pb-3">
          <span className="block font-medium text-gray-700 text-theme-sm">
            {user.full_name ?? user.email}
          </span>
          <span className="mt-0.5 block text-muted-foreground text-theme-xs">
            {user.email}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="flex flex-col gap-1 pt-3 pb-2">
          <DropdownMenuItem
            className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-700 text-theme-sm hover:bg-gray-100"
            onSelect={() => {
              window.location.href = "/profile";
            }}
          >
            Edit profile
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-700 text-theme-sm hover:bg-gray-100"
            onSelect={() => {
              window.location.href = "/profile";
            }}
          >
            Account settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-700 text-theme-sm hover:bg-gray-100"
            onSelect={() => {
              window.location.href = "/profile";
            }}
          >
            Support
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="flex flex-col gap-1 pt-2">
          <DropdownMenuItem
            className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-700 text-theme-sm hover:bg-gray-100"
            onSelect={() => signOut()}
          >
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-700 text-theme-sm hover:bg-gray-100"
            onSelect={() => signOutEverywhere()}
          >
            Sign out everywhere
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
