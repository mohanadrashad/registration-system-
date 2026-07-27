"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PortalLang } from "@/lib/portal/i18n";
import type { PortalEventInfo } from "./types";
import type { PortalT } from "./portal-strings";

// Two-step OTP login screen. Owns the whole login flow (email → code →
// verify, with resend cooldown); the page only learns about success via
// onLoggedIn. Mounted only while logged out, so logging out naturally
// resets it to a fresh email step.
export function LoginScreen({
  eventSlug,
  eventInfo,
  lang,
  t,
  isRtl,
  onToggleLang,
  onLoggedIn,
}: {
  eventSlug: string;
  eventInfo: PortalEventInfo | null;
  lang: PortalLang;
  t: PortalT;
  isRtl: boolean;
  onToggleLang: () => void;
  // Loads the portal data using the fresh cookie; resolves false when the
  // session was created but the data fetch failed.
  onLoggedIn: () => Promise<boolean>;
}) {
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Tick the resend cooldown every second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function requestOtp(opts?: { silent?: boolean }) {
    if (requestingOtp) return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLoginError(t.validEmail);
      return;
    }
    setRequestingOtp(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || t.couldntSendCode);
        return;
      }
      setOtpCode("");
      setLoginStep("code");
      // 30-second cool-off before "Resend" lights up again.
      setResendCooldown(30);
      if (!opts?.silent) {
        // No toast lib here — we rely on the on-screen messaging.
      }
    } catch {
      setLoginError(t.couldntReachServer);
    } finally {
      setRequestingOtp(false);
    }
  }

  async function verifyOtp(submittedCode?: string) {
    const codeToCheck = (submittedCode ?? otpCode).trim();
    if (verifyingOtp) return;
    if (!/^\d{6}$/.test(codeToCheck)) {
      setLoginError(t.enter6Digit);
      return;
    }
    setVerifyingOtp(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/portal/${eventSlug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, code: codeToCheck }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || t.codeFailed);
        setOtpCode("");
        return;
      }
      const ok = await onLoggedIn();
      if (!ok) {
        setLoginError(t.signedInButCouldntLoad);
      }
    } catch {
      setLoginError(t.couldntReachServer);
    } finally {
      setVerifyingOtp(false);
    }
  }

  function backToEmail() {
    setLoginStep("email");
    setOtpCode("");
    setLoginError("");
  }

  const loginBranding = eventInfo?.branding ?? null;
  const loginPrimary = loginBranding?.primaryColor || "#7dc242";
  const loginBackground = loginBranding?.backgroundColor || "#f9fafb";
  const loginTextColor = loginBranding?.textColor || "#111827";
  const loginLogo = loginBranding?.logoUrl || null;
  const loginCustomCss = loginBranding?.customCss ? (
    <style dangerouslySetInnerHTML={{ __html: loginBranding.customCss }} />
  ) : null;

  return (
    <>
      {loginCustomCss}
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: loginBackground }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="h-1.5 w-full" style={{ backgroundColor: loginPrimary }} />
        {/* Language toggle — top corner of the login screen, opposite */}
        {/* the upcoming RTL flip so it stays visible regardless of dir. */}
        {eventInfo?.multiLanguage && (
          <div className="flex justify-end p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleLang}
              aria-label={
                lang === "ar"
                  ? "Switch to English"
                  : "التبديل إلى العربية"
              }
            >
              {t.languageToggle}
            </Button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-sm">
            <CardHeader className="text-center space-y-3">
              {loginLogo && (
                <div className="flex justify-center">
                  <img
                    src={loginLogo}
                    alt={eventInfo?.name ?? ""}
                    className="max-h-12"
                  />
                </div>
              )}
              <CardTitle
                className="text-2xl"
                style={{ color: loginTextColor }}
              >
                {eventInfo?.name ?? t.attendeePortal}
              </CardTitle>
              <CardDescription>
                {loginStep === "email"
                  ? t.loginDescEmail
                  : t.loginDescCode}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  {loginError}
                </div>
              )}

              {loginStep === "email" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void requestOtp();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="email">{t.emailAddress}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.emailHelp}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11"
                    disabled={requestingOtp || !email}
                    style={{ backgroundColor: loginPrimary, color: "#fff" }}
                  >
                    {requestingOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.sendingCode}
                      </>
                    ) : (
                      t.sendMeCode
                    )}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verifyOtp();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t.sixDigitCode}</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={6}
                      pattern="[0-9]{6}"
                      value={otpCode}
                      onChange={(e) => {
                        const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setOtpCode(next);
                        if (loginError) setLoginError("");
                        // Auto-submit when 6 digits arrive (paste or type).
                        if (next.length === 6) {
                          void verifyOtp(next);
                        }
                      }}
                      className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                      placeholder="••••••"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {t.sentTo(email)}{" "}
                      <button
                        type="button"
                        onClick={backToEmail}
                        className="underline hover:text-foreground"
                      >
                        {t.useDifferentEmail}
                      </button>
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11"
                    disabled={verifyingOtp || otpCode.length !== 6}
                    style={{ backgroundColor: loginPrimary, color: "#fff" }}
                  >
                    {verifyingOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.verifying}
                      </>
                    ) : (
                      t.verifyAndSignIn
                    )}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => void requestOtp({ silent: true })}
                      disabled={resendCooldown > 0 || requestingOtp}
                      className="text-xs text-muted-foreground underline disabled:no-underline disabled:opacity-60"
                    >
                      {resendCooldown > 0
                        ? t.resendIn(resendCooldown)
                        : requestingOtp
                        ? t.sending
                        : t.didntGetItResend}
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
