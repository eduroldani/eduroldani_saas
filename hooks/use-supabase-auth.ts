"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";

type AuthState = "loading" | "authenticated" | "unauthenticated" | "mock";

export function useSupabaseAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setAuthState("mock");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthState("unauthenticated");
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setAuthUser(data.user ?? null);
      setAuthState(data.user ? "authenticated" : "unauthenticated");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setAuthUser(session?.user ?? null);
      setAuthState(session?.user ? "authenticated" : "unauthenticated");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { authUser, authState };
}
