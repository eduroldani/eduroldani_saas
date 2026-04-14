"use client";

import { FormEvent, useState } from "react";

export function LoginScreen({
  onLogin,
  onPasswordReset,
}: {
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setRecoveryMessage(null);
    setIsSubmitting(true);

    try {
      await onLogin({ email, password });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setRecoveryMessage(null);

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setIsSendingRecovery(true);

    try {
      await onPasswordReset(email.trim());
      setRecoveryMessage("Check your email for the reset link.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not send reset email");
    } finally {
      setIsSendingRecovery(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
        <p className="text-xs uppercase tracking-[0.24em] text-black/45">Eduroldan</p>
        <h1 className="mt-3 text-2xl font-semibold">Log in</h1>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
          />
          <input
            className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />

          {error ? <p className="text-sm text-black/55">{error}</p> : null}
          {recoveryMessage ? <p className="text-sm text-black/55">{recoveryMessage}</p> : null}

          <button
            className="w-full rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90 disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>

          <button
            className="w-full text-sm text-black/55 transition hover:text-black disabled:opacity-60"
            type="button"
            onClick={() => void handlePasswordReset()}
            disabled={isSendingRecovery}
          >
            {isSendingRecovery ? "Sending reset..." : "Forgot password?"}
          </button>
        </form>
      </section>
    </main>
  );
}
