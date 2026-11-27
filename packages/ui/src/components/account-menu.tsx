"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@barrelsgd/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
import { cn } from "@barrelsgd/ui/lib/utils";
import { LogOut } from "lucide-react";

/** The signed-in person, as the calling app read it from its own session. */
export interface AccountMenuUser {
  readonly email: string;
  readonly imageUrl?: string | null;
  readonly name?: string | null;
}

/** Another Barrels app listed under "Your apps". */
export interface AccountMenuApp {
  readonly href: string;
  readonly label: string;
}

/**
 * Where "Sign out" goes: a URL the form POSTs to (the app's own `/auth/logout`)
 * or a Server Action. The menu signs nobody out itself.
 */
export type AccountMenuSignOut =
  | { readonly href: string }
  | { readonly action: (formData: FormData) => void | Promise<void> };

interface SignedInProps {
  readonly accountUrl: string;
  readonly apps?: readonly AccountMenuApp[];
  readonly className?: string;
  readonly signInHref?: never;
  readonly signOut: AccountMenuSignOut;
  readonly user: AccountMenuUser;
}

interface SignedOutProps {
  readonly className?: string;
  readonly signInHref: string;
  readonly user: null;
}

export type AccountMenuProps = SignedInProps | SignedOutProps;

const SIGN_IN_CLASS =
  "border-border bg-background text-foreground inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm font-semibold focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

const TRIGGER_CLASS =
  "bg-muted inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

function displayName(user: AccountMenuUser): string {
  return user.name?.trim() || user.email;
}

/** The first character of the name, or of the email when there is no name. */
function initial(label: string): string {
  const first = Array.from(label.trim())[0];
  return first ? first.toLocaleUpperCase() : "?";
}

function SignOutItem({ signOut }: { readonly signOut: AccountMenuSignOut }) {
  const action = "action" in signOut ? signOut.action : signOut.href;
  return (
    <form action={action} method="post">
      <DropdownMenuItem
        className="min-h-11"
        nativeButton
        onClick={(event) =>
          event.currentTarget.closest("form")?.requestSubmit()
        }
        render={<button type="button" />}
      >
        <LogOut aria-hidden="true" />
        Sign out
      </DropdownMenuItem>
    </form>
  );
}

/**
 * The small account menu every Barrels app shows in its corner. Signed out it
 * is a "Sign in" link; signed in it is an avatar button that opens a menu with
 * the person's name and email, a link to the Barrels account app, the apps list
 * and sign-out. Presentational only: the calling app reads the session, builds
 * the URLs from its own env and passes them in.
 */
export function AccountMenu(props: AccountMenuProps) {
  if (props.user === null) {
    return (
      <a className={cn(SIGN_IN_CLASS, props.className)} href={props.signInHref}>
        Sign in
      </a>
    );
  }

  const { accountUrl, apps = [], className, signOut, user } = props;
  const name = displayName(user);
  const letter = initial(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className={cn(TRIGGER_CLASS, className)}
        render={<button type="button" />}
      >
        <Avatar className="size-9">
          <AvatarImage
            alt=""
            referrerPolicy="no-referrer"
            src={user.imageUrl || undefined}
          />
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
            {letter}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)] min-w-0 motion-reduce:animate-none"
        sideOffset={8}
      >
        <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
          {user.name?.trim() ? (
            <p className="text-popover-foreground truncate text-sm font-semibold">
              {user.name.trim()}
            </p>
          ) : null}
          <p
            className="text-muted-foreground truncate text-xs"
            title={user.email}
          >
            {user.email}
          </p>
        </div>
        <DropdownMenuItem
          className="bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground mt-1 min-h-11 justify-center font-semibold"
          render={<a href={accountUrl} />}
        >
          Manage your Barrels account
        </DropdownMenuItem>
        {apps.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Your apps</DropdownMenuLabel>
              {apps.map((app) => (
                <DropdownMenuItem
                  className="min-h-11"
                  key={app.href}
                  render={<a href={app.href} />}
                >
                  {app.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <SignOutItem signOut={signOut} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
