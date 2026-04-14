"use client";

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

  return (
    <header className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">edu roldani</h1>
        </div>

        <div className="flex items-center gap-3">
          <nav className="flex rounded-md border border-black/10 bg-[#fafafa] p-1">
            {[
              { href: "/", label: "Tasks" },
              { href: "/tags", label: "Tags" },
            ].map((item) => {
              const isActive = pathname === item.href;

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
    </header>
  );
}
