// 2FA UI: collects OTP, verifies with backend, and finalizes login session.
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Mail, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function TwoFactorAuthScreen({ onSuccess, onBackToLogin }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remainingMs, setRemainingMs] = useState(120000);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [resendAttemptsExhausted, setResendAttemptsExhausted] = useState(false);
  const navigate = useNavigate();

  const EXPIRED_MESSAGE = "Your code is no longer valid. Please click the resend button.";
  const RESEND_WAIT_MESSAGE = 'Please wait for the resend code timer to finish before requesting another code.';
  const EXPIRED_RESEND_WAIT_MESSAGE = 'Code expired. Wait until the resend code timer finishes, then request a new code.';
  const TOO_MANY_OTP_REQUESTS_MESSAGE = 'Too many OTP requests used. You have reached the resend limit for now. Please wait for the reset timer to finish before requesting a new code.';
  const TOO_MANY_EXPIRED_OTP_REQUESTS_MESSAGE = 'Too many OTP requests used. You have reached the resend limit, and the latest code has expired. Please wait for the reset timer to finish before requesting a new code.';

  const skewMsRef = useRef(0); // captures server ↔ client clock drift
  const expiresAtRef = useRef(null); // server-declared OTP expiry (ms)
  const timerIdRef = useRef(null);

  const EXPIRY_TOLERANCE_MS = 15000; // allow 15s cushion so 0:00 stays valid through network/drift jitter (matches backend)

  const formatCooldownTime = (seconds) => {
    const safeSeconds = Math.max(1, Number(seconds) || 1);
    if (safeSeconds < 60) {
      return `${safeSeconds} second${safeSeconds === 1 ? '' : 's'}`;
    }

    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    const minuteText = `${minutes} minute${minutes === 1 ? '' : 's'}`;

    if (remainingSeconds === 0) {
      return minuteText;
    }

    return `${minuteText} and ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
  };

  const showCooldownToast = () => {
    const codeHasExpired = remainingMs <= 0;

    toast.info(
      codeHasExpired
        ? EXPIRED_RESEND_WAIT_MESSAGE
        : RESEND_WAIT_MESSAGE,
      {
      description: undefined,
      classNames: {
        toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
      },
      }
    );
  };

  // THE FIX: Retrieve from Local Storage instead of Navigation State
  // Temp values set during login -> 2FA step
  const username = localStorage.getItem('temp_username');
  const email = localStorage.getItem('temp_email');
  const selectedBranch = localStorage.getItem('temp_branch_selected');
  const accountBranch = localStorage.getItem('temp_account_branch');
  const serverIssuedAt = Number(localStorage.getItem('otp_2fa_issued_at') || localStorage.getItem('otp_issued_at')); // server time (ms)
  const otpExpiresAtIso = localStorage.getItem('otp_2fa_expires_at') || localStorage.getItem('otp_expires_at');
  const cooldownStorageKey = username ? `otp_2fa_resend_available_at_${username.toLowerCase()}` : 'otp_2fa_resend_available_at';
  const exhaustedStorageKey = `${cooldownStorageKey}_exhausted`;

  useEffect(() => {
    // If no username is found, redirect to login (lost session)
    if (!username) {
      const existingToken = localStorage.getItem('token');
      // If already authenticated (e.g., navigated to dashboard), suppress the lost-session toast
      if (!existingToken) {
        toast.error("Session lost. Please login again.", {
          classNames: {
            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
          },
        });
        navigate('/');
      }
    }

    // Align countdown with server-issued timestamps to avoid drift
    const clientAnchor = Date.now();
    const fallbackExpires = (serverIssuedAt || clientAnchor) + 120000;
    const expiresAtMs = otpExpiresAtIso ? new Date(otpExpiresAtIso).getTime() : fallbackExpires;
    const skewMs = serverIssuedAt ? serverIssuedAt - clientAnchor : 0; // adjust for client/server clock drift

    skewMsRef.current = skewMs;
    expiresAtRef.current = expiresAtMs;

    const tick = () => {
      const nowAligned = Date.now() + skewMsRef.current;
      const remaining = (expiresAtRef.current || expiresAtMs) - nowAligned; // raw remaining in ms (can go slightly negative)
      setRemainingMs(remaining);

      // No auto-expiry toast at 0:00; backend grace still allows submissions
    };

    if (!timerIdRef.current) {
      timerIdRef.current = setInterval(tick, 500);
      tick(); // set initial value immediately for sync with backend expiry
    }

    return () => {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [username, navigate, serverIssuedAt, otpExpiresAtIso]);

  useEffect(() => {
    const tickCooldown = () => {
      const availableAt = Number(localStorage.getItem(cooldownStorageKey) || 0);
      const remaining = Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
      setResendCooldownSeconds(remaining);
      if (remaining === 0 && availableAt) {
        localStorage.removeItem(cooldownStorageKey);
        localStorage.removeItem(exhaustedStorageKey);
      }
      setResendAttemptsExhausted(localStorage.getItem(exhaustedStorageKey) === 'true' && remaining > 0);
    };

    tickCooldown();
    const id = setInterval(tickCooldown, 1000);
    return () => clearInterval(id);
  }, [cooldownStorageKey, exhaustedStorageKey]);

  const startResendCooldown = (seconds = 60, attemptsExhausted = false) => {
    const safeSeconds = Math.max(1, Number(seconds) || 60);
    localStorage.setItem(cooldownStorageKey, (Date.now() + safeSeconds * 1000).toString());
    if (attemptsExhausted) {
      localStorage.setItem(exhaustedStorageKey, 'true');
    } else {
      localStorage.removeItem(exhaustedStorageKey);
    }
    setResendCooldownSeconds(safeSeconds);
    setResendAttemptsExhausted(attemptsExhausted);
  };

  const handleCodeChange = (value) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
    setCode(digitsOnly);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const isPastGrace = remainingMs < -EXPIRY_TOLERANCE_MS;
    if (isPastGrace) {
      toast.error(EXPIRED_MESSAGE, {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }
    if (code.length !== 6) {
      toast.error("Please enter the full 6-digit code", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setLoading(true);
    let verifySucceeded = false;
    try {
      // 1. Verify with Backend
      const response = await axios.post('http://localhost:5000/api/auth/verify-otp', {
        username,
        code,
        branch: selectedBranch
      });

      // 2. Success: Save Token
      const { token, user } = response.data;

      // Branch handling: allow Admin to choose any branch; employees must match account branch
      const resolvedBranch = selectedBranch || user?.branch || accountBranch;
      if (user?.role !== 'Admin' && selectedBranch && resolvedBranch && selectedBranch !== resolvedBranch) {
        toast.error("Selected branch does not match your account", {
          classNames: {
            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
          },
        });
        localStorage.removeItem('temp_username');
        localStorage.removeItem('temp_email');
        localStorage.removeItem('temp_branch_selected');
        localStorage.removeItem('temp_account_branch');
        navigate('/');
        return;
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      if (resolvedBranch) {
        localStorage.setItem('active_branch', resolvedBranch);
      }

      // 3. CLEANUP (Remove temporary 2FA data)
      localStorage.removeItem('temp_username');
      localStorage.removeItem('temp_email');
      localStorage.removeItem('temp_branch_selected');
      localStorage.removeItem('temp_account_branch');
      localStorage.removeItem('otp_2fa_issued_at');
      localStorage.removeItem('otp_2fa_expires_at');
      localStorage.removeItem('otp_issued_at');
      localStorage.removeItem('otp_expires_at');
      
      toast.success("Verification Successful!", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });

      verifySucceeded = true;

      // Notify parent app to set authenticated user state; fallback to direct nav if not provided
      if (typeof onSuccess === 'function') {
        onSuccess(user);
      } else {
        sessionStorage.setItem('authSessionActive', 'true');
        navigate('/dashboard', { replace: true });
      }

    } catch (error) {
      const apiMessage = error.response?.data?.error;
      const normalized = typeof apiMessage === 'string' ? apiMessage.toLowerCase() : '';
      const isExpired = normalized.includes('expire');
      const message = isExpired ? EXPIRED_MESSAGE : (apiMessage || "Invalid Code");
      toast.error(message, {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      setCode(''); // Clear input on error
    } finally {
      setLoading(false);
      // Timer continues running; no restart logic needed.
    }
  };

  const handleResend = async () => {
    if (!username) return;
    if (resendCooldownSeconds > 0) {
      if (resendAttemptsExhausted) {
        toast.error(remainingMs <= 0 ? TOO_MANY_EXPIRED_OTP_REQUESTS_MESSAGE : TOO_MANY_OTP_REQUESTS_MESSAGE, {
          classNames: {
            toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
          },
        });
        return;
      }

      showCooldownToast();
      return;
    }

    setResending(true);
    try {
      const resp = await axios.post('http://localhost:5000/api/auth/send-otp', { username });
      const serverTime = resp.data.serverTime || Date.now();
      const expiresAt = resp.data.expiresAt || new Date(Date.now() + 120000).toISOString();

      // Persist new timestamps
      localStorage.setItem('otp_2fa_issued_at', serverTime.toString());
      localStorage.setItem('otp_2fa_expires_at', expiresAt);
      localStorage.removeItem('otp_issued_at');
      localStorage.removeItem('otp_expires_at');
      startResendCooldown(resp.data.retryAfterSeconds || 60, resp.data.remainingAttempts === 0);

      // Re-sync countdown with new values
      const clientNow = Date.now();
      const newSkew = serverTime - clientNow;
      skewMsRef.current = newSkew;
      expiresAtRef.current = new Date(expiresAt).getTime();
      const alignedNow = Date.now() + skewMsRef.current;
      setRemainingMs(expiresAtRef.current - alignedNow);

      // Reset input and UI state
      setCode('');
      toast.success(resp.data.message || 'Verification code sent. Please check your email.', {
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } catch (error) {
      const retryAfterSeconds = error.response?.data?.retryAfterSeconds;
      const remainingAttempts = error.response?.data?.remainingAttempts;
      if (retryAfterSeconds) {
        startResendCooldown(retryAfterSeconds, remainingAttempts === 0);
      }
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to resend code', {
        description: retryAfterSeconds && remainingAttempts !== 0
          ? (remainingMs <= 0
            ? EXPIRED_RESEND_WAIT_MESSAGE
            : RESEND_WAIT_MESSAGE)
          : undefined,
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    localStorage.removeItem('temp_username');
    localStorage.removeItem('temp_email');
    localStorage.removeItem('temp_branch_selected');
    localStorage.removeItem('temp_account_branch');
    localStorage.removeItem('otp_2fa_issued_at');
    localStorage.removeItem('otp_2fa_expires_at');
    localStorage.removeItem('otp_issued_at');
    localStorage.removeItem('otp_expires_at');
    setCode('');

    if (typeof onBackToLogin === 'function') {
      onBackToLogin();
    } else {
      navigate('/login', { replace: true });
    }
  };

  const formatTime = (ms) => {
    // Use ceil to avoid displaying 0:00 too early when ~1s remains
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes.toString()}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50">
        <Card className="w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="px-12 py-10 space-y-8">
            <div className="flex justify-center mb-4">
              <div className="bg-[#FFFF00]/20 border border-[#FFFF00]/60 p-4 rounded-full">
                <ShieldCheck className="w-10 h-10 text-[#FF0000]" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-3xl text-gray-900">Two-Factor Authentication</h2>
              <p className="text-lg text-gray-600 flex flex-wrap items-center justify-center gap-2 text-center leading-snug">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="whitespace-pre">Code sent to</span>
                <span className="font-semibold text-gray-900 break-all text-center max-w-full">
                  {email || "your email"}
                </span>
              </p>
              <p className="text-sm text-red-600 font-semibold">Expires in {formatTime(remainingMs)}</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-gray-800">Enter 6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="h-12 rounded-xl border-gray-300 text-center text-xl tracking-[0.45em] font-semibold focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  maxLength={6}
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300 disabled:opacity-70"
              >
                {loading ? "Verifying..." : "Verify Identity"}
              </Button>

              <Button
                type="button"
                onClick={handleResend}
                disabled={loading || resending}
                className="w-full py-5 rounded-xl border-2 border-[#FF0000] text-[#FF0000] bg-white hover:bg-red-50 shadow-sm transition-all duration-300 disabled:opacity-70"
              >
                {resending
                  ? "Sending new code..."
                  : resendCooldownSeconds > 0
                    ? `Resend Code (${resendCooldownSeconds}s)`
                    : "Resend Code"}
              </Button>

              <div className="text-center text-sm text-gray-600">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-blue-600 hover:underline"
                >
                  Back to Login
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 hidden lg:flex flex-col justify-center items-start bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-16 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-30">
          <div className="absolute top-10 right-10 w-72 h-72 bg-[#FFFF00] rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#FF0000] rounded-full blur-3xl" />
        </div>

        <div className="max-w-xl space-y-8 relative z-10">
          <div className="inline-block">
            <h2 className="text-5xl mb-2 text-gray-900">Secure Access</h2>
            <div className="h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full" />
          </div>

          <p className="text-xl text-gray-700 leading-relaxed">
            Two-Factor Authentication ensures your account stays protected with an additional layer of security. Your data and inventory information are safeguarded with industry-standard encryption.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Protecting your business with advanced security measures."
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {["Email verification code", "Time-limited access codes", "Secure session management"].map((item) => (
              <div key={item} className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFF00] text-gray-900 shadow-sm">
                  <Check className="w-5 h-5" />
                </span>
                <span className="text-lg text-gray-800">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TwoFactorAuthScreen;
