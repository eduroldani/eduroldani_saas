"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Profile } from "@/lib/task-types";

function Avatar({ profile }: { profile: Profile }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#f1f1f1] text-xs font-medium text-black"
      aria-label={profile.name}
      title={profile.name}
    >
      {profile.avatarLabel}
    </div>
  );
}

export function AppHeader({
  profile,
  onProfileClick,
}: {
  profile: Profile;
  onProfileClick: () => void;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navItems = [
    { href: "/", label: "Tasks" },
    { href: "/dailies", label: "Dailies" },
    { href: "/sports", label: "Sports" },
    { href: "/buy", label: "Buy" },
    { href: "/clients", label: "Clients" },
    { href: "/notes", label: "Notes" },
    { href: "/projects", label: "Projects" },
    { href: "/tags", label: "Tags" },
  ];
  const pageTitle =
    pathname === "/dailies"
      ? "Dailies"
      : pathname === "/sports"
        ? "Sports"
      : pathname === "/buy"
      ? "Buy"
      : pathname === "/tags"
        ? "Tags"
        : pathname.startsWith("/clients")
          ? "Clients"
        : pathname === "/notes"
          ? "Notes"
          : pathname === "/projects"
            ? "Projects"
            : "Tasks";

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <header className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-[#fafafa] text-sm text-black/70 transition hover:border-black/30 sm:hidden"
            type="button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            {isMenuOpen ? (
              "X"
            ) : (
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            )}
          </button>

          <nav className="hidden rounded-md border border-black/10 bg-[#fafafa] p-1 sm:flex">
            {navItems.map((item) => {
              const isActive =
                item.href === "/clients"
                  ? pathname.startsWith("/clients")
                  : pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                    isActive ? "bg-black text-white" : "text-black/55"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#fafafa] transition hover:border-black/30"
            type="button"
            onClick={onProfileClick}
            aria-label="Open profile"
          >
            <Avatar profile={profile} />
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <nav className="mt-3 flex flex-col gap-2 rounded-md border border-black/10 bg-[#fafafa] p-2 sm:hidden">
          {navItems.map((item) => {
            const isActive =
              item.href === "/clients"
                ? pathname.startsWith("/clients")
                : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-black text-white" : "text-black/65"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
