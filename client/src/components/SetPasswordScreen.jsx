import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';

const emcLogoSrc = "/emc-logo.png";
const EXPIRY_TOLERANCE_MS = 15000; // 15s grace to match backend acceptance
const EXPIRED_MESSAGE = "Your code is no longer valid. Please click the resend button.";

const SetPasswordScreen = () => {
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [remainingMs, setRemainingMs] = useState(120000);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;
  const issuedAt = useRef(Number(location.state?.otpIssuedAt) || Date.now());
  const expiresAt = useRef(location.state?.otpExpiresAt ? new Date(location.state.otpExpiresAt).getTime() : (issuedAt.current + 120000));
  const skewRef = useRef(issuedAt.current - Date.now());
  const timerIdRef = useRef(null);

  useEffect(() => {
    if (!email) navigate('/forgot-password');
  }, [email, navigate]);

  useEffect(() => {
    const tick = () => {
      const nowAligned = Date.now() + skewRef.current;
      const remaining = expiresAt.current - nowAligned; // raw ms, can go negative during grace
      setRemainingMs(remaining);
    };

    if (!timerIdRef.current) {
      timerIdRef.current = setInterval(tick, 500);
      tick();
    }

    return () => {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, []);

  const formatTime = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleReset = async (e) => {
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
    const sanitizedOtp = otp.replace(/\s+/g, '');
    if (sanitizedOtp.length !== 6) {
      toast.error("Please enter the full 6-digit code", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }
    setLoading(true);
    try {
      await axios.post('http://localhost:5000/api/auth/reset-password', {
        email,
        otp: sanitizedOtp,
        newPassword
      });
      toast.success("Password reset successfully! Please login.", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      navigate('/');
    } catch (error) {
      const apiMessage = error.response?.data?.error;
      const normalized = typeof apiMessage === 'string' ? apiMessage.toLowerCase() : '';
      const hasInvalid = normalized.includes('invalid');
      const hasExpire = normalized.includes('expire');
      const message = hasInvalid ? "Invalid code" : (hasExpire ? EXPIRED_MESSAGE : (apiMessage || "Invalid code"));
      toast.error(message, {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      const resp = await axios.post('http://localhost:5000/api/auth/forgot-password', { email });
      const serverTime = resp.data.serverTime || Date.now();
      const newExpires = resp.data.expiresAt ? new Date(resp.data.expiresAt).getTime() : serverTime + 120000;

      // Update alignment refs for fresh countdown
      issuedAt.current = serverTime;
      expiresAt.current = newExpires;
      skewRef.current = serverTime - Date.now();

      const alignedNow = Date.now() + skewRef.current;
      setRemainingMs(newExpires - alignedNow);

      // Clear input to avoid stale code entry
      setOtp('');

      toast.success('A new verification code was sent.', {
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to resend code', {
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } finally {
      setResending(false);
    }
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
              <h2 className="text-3xl text-gray-900">Set New Password</h2>
              <p className="text-lg text-gray-600 flex flex-wrap items-center justify-center gap-2 text-center leading-snug">
                <Mail className="w-4 h-4" />
                <span className="whitespace-pre">Code sent to</span>
                <span className="font-semibold text-gray-900 break-all text-center max-w-full">{email || 'your email'}</span>
              </p>
              <p className="text-sm text-red-600 font-semibold">
                Expires in {formatTime(remainingMs)}
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="otp" className="text-gray-800 flex items-center gap-1">Verification Code <span className="text-red-600">*</span></Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-800 flex items-center gap-1">New Password <span className="text-red-600">*</span></Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
                disabled={!otp || !newPassword || loading}
              >
                {loading ? "Submitting..." : "Reset Password"}
              </Button>

              <Button
                type="button"
                onClick={handleResend}
                disabled={loading || resending}
                className="w-full py-5 rounded-xl border-2 border-[#FF0000] text-[#FF0000] bg-white hover:bg-red-50 shadow-sm transition-all duration-300 disabled:opacity-70"
              >
                {resending ? "Sending new code..." : "Resend Code"}
              </Button>

              <div className="text-center text-sm text-gray-600">
                <Link to="/" className="text-blue-600 hover:underline">Back to Login</Link>
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
            <h2 className="text-5xl mb-2 text-gray-900">Set A New Password</h2>
            <div className="h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full" />
          </div>

          <p className="text-xl text-gray-700 leading-relaxed">
            Securely set a new password to continue managing inventory, sales, and reporting.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Your account security keeps operations running smoothly across branches."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SetPasswordScreen;
