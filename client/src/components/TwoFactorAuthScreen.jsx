// 2FA UI: collects OTP, verifies with backend, and finalizes login session.
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function TwoFactorAuthScreen() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [remainingMs, setRemainingMs] = useState(120000);
  const navigate = useNavigate();

  const expiryToastShown = useRef(false);

  // THE FIX: Retrieve from Local Storage instead of Navigation State
  // Temp values set during login -> 2FA step
  const username = localStorage.getItem('temp_username');
  const email = localStorage.getItem('temp_email');
  const selectedBranch = localStorage.getItem('temp_branch_selected');
  const accountBranch = localStorage.getItem('temp_account_branch');
  const serverIssuedAt = Number(localStorage.getItem('otp_issued_at')); // server time (ms)
  const otpExpiresAtIso = localStorage.getItem('otp_expires_at');

  useEffect(() => {
    // If no username is found, redirect to login (lost session)
    if (!username) {
      toast.error("Session lost. Please login again.", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      navigate('/');
    }

    // Align countdown with server-issued timestamps to avoid drift
    const clientAnchor = Date.now();
    const expiresAtMs = otpExpiresAtIso ? new Date(otpExpiresAtIso).getTime() : (serverIssuedAt || clientAnchor) + 120000;
    const skewMs = serverIssuedAt ? serverIssuedAt - clientAnchor : 0; // adjust for client/server clock drift

    let timerId;
    const tick = () => {
      const nowAligned = Date.now() + skewMs;
      const remaining = expiresAtMs - nowAligned; // raw remaining in ms
      setRemainingMs(Math.max(0, remaining));

      // Show expiry toast exactly when the countdown hits 0:00; only once
      if (remaining <= 0 && !expiryToastShown.current) {
        expiryToastShown.current = true;
        toast.error("The verification code has expired. Please login again to request a new code.", {
          classNames: {
            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
          },
        });
        if (timerId) {
          clearInterval(timerId);
        }
      }
    };

    timerId = setInterval(tick, 500);
    tick(); // set initial value immediately for sync with backend expiry

    return () => clearInterval(timerId);
  }, [username, navigate, serverIssuedAt, otpExpiresAtIso]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`code-${index + 1}`).focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      toast.error("Please enter the full 6-digit code", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Verify with Backend
      const response = await axios.post('http://localhost:5000/api/auth/verify-otp', {
        username,
        code: fullCode,
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
      localStorage.removeItem('otp_issued_at');
      
      toast.success("Verification Successful!", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      navigate('/dashboard', { replace: true }); // Smooth SPA transition to dashboard

    } catch (error) {
      toast.error(error.response?.data?.error || "Invalid Code", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      setCode(['', '', '', '', '', '']); // Clear inputs on error
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
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
              <p className="text-lg text-gray-600 flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" />
                Code sent to <span className="font-semibold text-gray-900">{email || "your email"}</span>
              </p>
              <p className="text-sm text-red-600 font-semibold">Expires in {formatTime(remainingMs)}</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-gray-800">Enter 6-digit code</Label>
                <div className="flex justify-between gap-2">
                  {code.map((digit, index) => (
                    <Input
                      key={index}
                      id={`code-${index}`}
                      type="text"
                      maxLength="1"
                      value={digit}
                      onChange={(e) => handleChange(index, e.target.value)}
                      className="w-12 h-12 text-center text-xl rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    />
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300 disabled:opacity-70"
              >
                {loading ? "Verifying..." : "Verify Identity"}
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
            <h2 className="text-5xl mb-2 text-gray-900">E.M. Cayetano Trading</h2>
            <div className="h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full" />
          </div>

          <p className="text-xl text-gray-700 leading-relaxed">
            Protecting your account with secure verification for every login and branch selection.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Double-checking your identity keeps your inventory data and transactions safe."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TwoFactorAuthScreen;