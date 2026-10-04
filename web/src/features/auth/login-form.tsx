"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, CircleCheck, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { postSignInPath } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, fieldMessages } from "@/lib/api/errors";

function nextParam() {
  return new URLSearchParams(window.location.search).get("next");
}

export function LoginForm() {
  const router = useRouter();
  const { account, isLoading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isLoading && account) {
      router.replace(postSignInPath(account, nextParam()));
    }
  }, [account, isLoading, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const signedIn = await signIn(email.trim(), password);
      router.replace(postSignInPath(signedIn, nextParam()));
    } catch (caught) {
      const fieldError = [...fieldMessages(caught, "email"), ...fieldMessages(caught, "password")];
      if (caught instanceof ApiError) {
        setError(fieldError[0] || caught.message);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("Sign-in failed.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="gradient-mesh relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.75_0.08_205/0.15),transparent_40%),radial-gradient(circle_at_80%_80%,oklch(0.7_0.06_175/0.12),transparent_35%)]" />
      <Card className="relative w-full max-w-4xl overflow-hidden border-primary/10 shadow-premium-lg">
        <div className="grid md:grid-cols-[1.05fr_1fr]">
          <div className="relative overflow-hidden bg-primary px-6 py-10 text-primary-foreground md:px-10 md:py-12">
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 size-32 rounded-full bg-white/5 blur-xl" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <BrandLogo size="md" className="bg-primary-foreground/15 text-primary-foreground ring-1 ring-primary-foreground/20" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-90">ClinicSys</p>
                  <p className="flex items-center gap-1 text-[11px] opacity-75">
                    <Sparkles className="size-3" />
                    Premium Edition
                  </p>
                </div>
              </div>
              <h1 className="mt-8 text-2xl font-bold leading-tight md:text-3xl">
                Premium workflow for modern clinics
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-primary-foreground/85">
                Securely access patient records, queue operations, and billing workflows from one unified workspace.
              </p>
              <ul className="mt-8 space-y-3 text-sm">
                {[
                  "Role-based access by branch and department",
                  "Connected clinical, lab, pharmacy, and billing modules",
                  "Audit-ready activity trails for operational control",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 opacity-90" />
                    <span className="opacity-95">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-card px-6 py-10 md:px-10 md:py-12">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>Use your clinic-issued email and password to continue.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    className="h-11"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>
                    <p className="text-xs text-muted-foreground">Contact your clinic admin if you forgot it.</p>
                  </div>
                  <PasswordInput
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    className="h-11"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
                <Button className="h-11 w-full text-base" type="submit" disabled={pending}>
                  {pending ? "Signing in…" : "Sign in to workspace"}
                  {!pending ? <ArrowRight className="size-4" /> : null}
                </Button>
              </form>
            </CardContent>
          </div>
        </div>
      </Card>
    </main>
  );
}
