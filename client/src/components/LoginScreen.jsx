// Login screen: validates credentials, calls backend login, and starts the
// two-factor verification flow when an OTP challenge is required.
import axios from 'axios';
import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Lock, Store, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { toast } from "sonner";

import { Link, useNavigate } from 'react-router-dom';
import { apiUrl } from "../utils/api";

const emcLogoSrc = "/emc-logo.png";
const LOGIN_BACKGROUND_CLASS = "login-screen-active";

export function LoginScreen({ onLogin, onNavigateTo2FA, onForgotPassword }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState("");
  const [branchHintShown, setBranchHintShown] = useState(false);
  const [isCheckingAssignedBranch, setIsCheckingAssignedBranch] = useState(false);
  const [assignedBranchNotice, setAssignedBranchNotice] = useState("");
  const [isBranchSelectionReady, setIsBranchSelectionReady] = useState(false);
  const [isAssignedBranchLocked, setIsAssignedBranchLocked] = useState(false);
  const [autoSelectedBranch, setAutoSelectedBranch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add(LOGIN_BACKGROUND_CLASS);
    document.body.classList.add(LOGIN_BACKGROUND_CLASS);

    return () => {
      document.documentElement.classList.remove(LOGIN_BACKGROUND_CLASS);
      document.body.classList.remove(LOGIN_BACKGROUND_CLASS);
    };
  }, []);

  // Show a hint if branch is chosen before username/password
  useEffect(() => {
    if (branch && (!username || !password) && !branchHintShown) {
      toast.error("Please fill the other fields", {
        id: "login-fill-other-fields",
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      setBranchHintShown(true);
    }

    // Reset hint once all fields are provided or branch cleared
    if (!branch || (username && password)) {
      setBranchHintShown(false);
    }
  }, [branch, username, password, branchHintShown]);

  const fetchAssignedBranchForCredentials = async (loginUsername, loginPassword) => {
    const response = await axios.post(apiUrl('/api/auth/assigned-branch'), {
      username: loginUsername,
      password: loginPassword
    });
    return {
      branch: String(response.data?.branch || '').trim(),
      role: response.data?.role || '',
      branchLocked: Boolean(response.data?.branchLocked)
    };
  };

  useEffect(() => {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setIsCheckingAssignedBranch(false);
      setAssignedBranchNotice("");
      setIsBranchSelectionReady(false);
      setIsAssignedBranchLocked(false);
      setBranch("");
      setAutoSelectedBranch("");
      return undefined;
    }

    let isActive = true;
    setIsCheckingAssignedBranch(true);
    setIsBranchSelectionReady(false);
    setIsAssignedBranchLocked(false);
    setBranch("");
    setAutoSelectedBranch("");
    const timer = window.setTimeout(async () => {
      try {
        const assigned = await fetchAssignedBranchForCredentials(cleanUsername, password);
        if (!isActive) return;

        if (assigned.branch) {
          setBranch(assigned.branch);
          setAutoSelectedBranch(assigned.branch);
          setIsAssignedBranchLocked(assigned.branchLocked);
          setIsBranchSelectionReady(true);
          setAssignedBranchNotice(`${assigned.branch} branch selected from your account.`);
        } else {
          setAutoSelectedBranch("");
          setIsAssignedBranchLocked(false);
          setIsBranchSelectionReady(true);
          setAssignedBranchNotice("Select the branch you want to use.");
        }
      } catch {
        if (isActive) {
          setAssignedBranchNotice("Unable to verify login details.");
          setIsBranchSelectionReady(false);
          setIsAssignedBranchLocked(false);
          setBranch("");
          setAutoSelectedBranch("");
        }
      } finally {
        if (isActive) {
          setIsCheckingAssignedBranch(false);
        }
      }
    }, 500);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [username, password]);

  const continueToTwoFactor = (loginData, otpData = {}, { reusedExistingCode = false, loginBranch = branch } = {}) => {
    const challengeUsername = String(loginData.username || username || '').trim();
    const challengeEmail = loginData.email || '';
    if (!challengeUsername) return;
    const serverTime = otpData.serverTime || Date.now();
    const expiresAt = otpData.expiresAt || new Date(Date.now() + 120000).toISOString();
    const resendCooldownKey = `otp_2fa_resend_available_at_${challengeUsername.toLowerCase()}`;
    const resendExhaustedKey = `${resendCooldownKey}_exhausted`;

    // Persist the active challenge so accidental navigation does not strand a valid OTP.
    localStorage.setItem('otp_2fa_issued_at', serverTime.toString());
    localStorage.setItem('otp_2fa_expires_at', expiresAt);
    localStorage.removeItem('otp_issued_at');
    localStorage.removeItem('otp_expires_at');

    if (otpData.retryAfterSeconds) {
      localStorage.setItem(
        resendCooldownKey,
        (Date.now() + Number(otpData.retryAfterSeconds || 60) * 1000).toString()
      );
    }
    if (otpData.remainingAttempts === 0) {
      localStorage.setItem(resendExhaustedKey, 'true');
    } else {
      localStorage.removeItem(resendExhaustedKey);
    }

    localStorage.setItem('temp_username', challengeUsername);
    localStorage.setItem('temp_email', challengeEmail);
    localStorage.setItem('temp_branch_selected', loginBranch);

    if (reusedExistingCode) {
      toast.info('A verification code was already sent. Please enter the latest code from your email.', {
        id: 'login-existing-otp-challenge',
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
    }

    if (typeof onNavigateTo2FA === 'function') {
      onNavigateTo2FA({
        username: challengeUsername,
        email: challengeEmail,
        branch: loginBranch,
      });
    } else {
      navigate('/2fa');
    }
  };

  // Submit credentials; on success either receive token or trigger 2FA flow
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      toast.error("Please fill the other fields", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setIsLoggingIn(true);

    try {
      let loginBranch = "";
      try {
        setIsCheckingAssignedBranch(true);
        const assigned = await fetchAssignedBranchForCredentials(username.trim(), password);
        if (assigned.branch) {
          loginBranch = assigned.branch;
          setBranch(assigned.branch);
          setAutoSelectedBranch(assigned.branch);
          setIsAssignedBranchLocked(assigned.branchLocked);
          setAssignedBranchNotice(`${assigned.branch} branch selected from your account.`);
        } else {
          loginBranch = branch;
          setAutoSelectedBranch("");
          setIsAssignedBranchLocked(false);
          setIsBranchSelectionReady(true);
          setAssignedBranchNotice("Select the branch you want to use.");
        }
      } catch (branchError) {
        setBranch("");
        setAutoSelectedBranch("");
        setIsBranchSelectionReady(false);
        setIsAssignedBranchLocked(false);
        toast.error(branchError.response?.data?.error || "Unable to verify your branch. Please check your login details.", {
          classNames: {
            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
          },
        });
        return;
      } finally {
        setIsCheckingAssignedBranch(false);
      }

      if (!loginBranch) {
        toast.error("Please select your branch.", {
          classNames: {
            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
          },
        });
        return;
      }

      const response = await axios.post(apiUrl('/api/auth/login'), {
        username,
        password,
        branch: loginBranch
      });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('active_branch', loginBranch);
        sessionStorage.setItem('authSessionActive', 'true');
        window.dispatchEvent(new Event('auth-state-changed'));
        if (typeof onLogin === 'function') {
          onLogin(response.data.user);
        } else {
          navigate('/dashboard', { replace: true });
        }
        return;
      }

      if (response.data.require2fa) {
        try {
          const otpResponse = await axios.post(apiUrl('/api/auth/send-otp'), { username });
          continueToTwoFactor(response.data, otpResponse.data, { loginBranch });
        } catch (otpError) {
          const otpStatus = otpError.response?.status;
          const otpMessage = otpError.response?.data?.error || otpError.response?.data?.message || '';
          const hasActiveCode = otpStatus === 429 && otpMessage.toLowerCase().includes('already sent');
          if (hasActiveCode) {
            continueToTwoFactor(response.data, otpError.response?.data, { reusedExistingCode: true, loginBranch });
            return;
          }
          throw otpError;
        }
      }

    } catch (error) {
      toast.error(error.response?.data?.error || "Invalid username or password", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const hasCredentialsForBranchCheck = Boolean(username.trim() && password);
  const branchNoticeText = isCheckingAssignedBranch
    ? "Checking branch..."
    : assignedBranchNotice || (!hasCredentialsForBranchCheck ? "Enter username and password first." : "");
  const isBranchNoticeError = branchNoticeText === "Unable to verify login details.";
  const isBranchNoticeNeutral = branchNoticeText === "Enter username and password first.";

  return (
    <div className="login-page auth-gradient-page min-h-screen flex">
      <style>{`
        html,
        body,
        #root,
        .auth-screen-shell,
        .login-page {
          width: 100%;
          min-height: 100dvh;
          min-height: 100svh;
          min-height: 100vh;
          margin: 0;
          padding: 0;
          background-color: #fff7ed !important;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%) !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }

        html.${LOGIN_BACKGROUND_CLASS},
        body.${LOGIN_BACKGROUND_CLASS} {
          min-width: 100%;
          min-height: 100dvh;
          min-height: 100svh;
          min-height: 100vh;
          overflow-x: hidden;
          background-color: #fff7ed !important;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%) !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }

        .auth-screen-shell,
        .login-page {
          box-sizing: border-box;
          min-height: 100dvh;
          min-height: 100svh;
          min-height: 100vh;
          margin: 0 !important;
          padding: 0 !important;
          overflow-x: hidden;
          background-color: #fff7ed !important;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%) !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }

        .login-page {
          position: fixed;
          inset: 0;
          max-width: none !important;
          width: 100vw;
          height: 100dvh;
          min-height: 100dvh;
          overflow-x: hidden;
          overflow-y: auto;
          isolation: isolate;
          background-color: #fff7ed !important;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%) !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }

        .login-page::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background-color: #fff7ed;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%);
          background-repeat: no-repeat;
          background-size: cover;
        }

        .login-form-pane {
          position: relative;
          z-index: 1;
        }

        @media (min-width: 1024px) {
          .login-brand-rule {
            display: block;
            width: 4.25rem;
            height: 3px;
            margin: 0.75rem auto 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #ffff00, #ff0000);
          }

          .login-mobile-copy {
            display: block;
            max-width: 24rem;
            margin: 0.75rem auto 0;
            color: #475569;
            font-size: 0.95rem;
            line-height: 1.45;
          }

          .login-field-control {
            padding-left: 3.25rem !important;
          }

          .login-field-icon {
            display: flex;
            left: 1.1rem !important;
            width: 1.08rem;
            height: 1.08rem;
          }

          .login-password-input {
            padding-right: 3rem !important;
          }
        }

        @media (max-width: 1023px) {
          html,
          body,
          #root,
          .auth-screen-shell {
            min-height: 100dvh;
            min-height: 100svh;
            min-height: 100vh;
            width: 100%;
            margin: 0;
            padding: 0;
            background-color: #fff7ed !important;
            background-image:
              radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
              radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
              linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%) !important;
            background-repeat: no-repeat !important;
            background-size: cover !important;
          }

          .login-page {
            width: 100vw;
            max-width: 100%;
            min-width: 0;
            min-height: 100dvh;
            min-height: 100svh;
            min-height: 100vh;
            display: block;
            overflow-x: hidden;
          }

          .login-form-pane {
            width: 100%;
            max-width: 100%;
            min-height: 100dvh;
            min-height: 100svh;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
            padding: 1rem 1rem 1.1rem;
            background: transparent !important;
            overflow-x: hidden;
          }

          .login-card {
            width: min(100%, 420px);
            max-width: 420px;
            margin-left: auto;
            margin-right: auto;
            border-radius: 1.25rem;
            border-color: rgba(226, 232, 240, 0.75);
            background: rgba(255, 255, 255, 0.72) !important;
            backdrop-filter: blur(12px);
            box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
          }

          .login-card-content {
            padding: 0.9rem 1.05rem 1rem;
            gap: 0;
          }

          .login-brand {
            margin-bottom: 1rem;
          }

          .login-logo {
            width: 4.35rem;
            height: 4.35rem;
          }

          .login-title {
            font-size: clamp(1.35rem, 5.8vw, 1.7rem);
            line-height: 1.12;
            font-weight: 500;
          }

          .login-subtitle {
            font-size: 0.88rem;
            line-height: 1.35;
          }

          .login-mobile-copy {
            display: block;
            max-width: 19rem;
            margin: 0.5rem auto 0;
            color: #475569;
            font-size: 0.84rem;
            line-height: 1.4;
          }

          .login-brand-rule {
            display: block;
            width: 3.5rem;
            height: 3px;
            margin: 0.55rem auto 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #ffff00, #ff0000);
          }

          .login-form {
            gap: 0.85rem;
          }

          .login-field {
            gap: 0.45rem;
          }

          .login-field label {
            font-size: 0.88rem;
          }

          .login-field-control {
            min-height: 2.75rem;
            padding-left: 3.15rem !important;
            font-size: 0.92rem;
            line-height: 1.25;
          }

          .login-field-icon {
            display: flex;
            left: 1.05rem !important;
            width: 1.05rem;
            height: 1.05rem;
          }

          .login-password-input {
            padding-right: 2.75rem !important;
          }

          .login-button {
            min-height: 2.85rem;
            padding-top: 0;
            padding-bottom: 0;
            font-weight: 500;
          }

          .login-links {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
            margin-top: 0.35rem;
          }

          .login-link-divider {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0 !important;
            margin: 0;
          }

          .login-link-divider span:not(.login-divider-text) {
            height: 1px;
            flex: 1;
            background: rgba(203, 213, 225, 0.95);
          }

          .login-divider-text {
            color: #64748b;
            font-size: 0.78rem;
            line-height: 1;
          }

          .login-forgot-link,
          .login-register-link {
            display: inline-flex;
            min-height: 2rem;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
          }

          .login-register-row {
            display: flex;
            min-height: 2.35rem;
            align-items: center;
            justify-content: center;
            gap: 0.25rem;
            border-radius: 0.95rem;
            color: #1f2937;
            line-height: 1.35;
          }
        }

        @media (max-width: 390px) {
          .login-form-pane {
            padding: 0.85rem 0.7rem 0.9rem;
          }

          .login-card-content {
            padding: 0.85rem;
          }

          .login-logo {
            width: 4rem;
            height: 4rem;
          }
        }
      `}</style>

      <div className="login-form-pane auth-gradient-pane flex-1 flex items-center justify-center p-12 bg-transparent">
        <Card className="login-card w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="login-card-content px-12 py-10 space-y-8">
            <div className="login-brand">
              <div className="flex justify-center mb-4">
                <img src={emcLogoSrc} alt="EMC Logo" className="login-logo w-24 h-24 object-contain" />
              </div>

              <div className="text-center space-y-2">
                <h2 className="login-title text-3xl text-gray-900">E.M. Cayetano Trading</h2>
                <p className="login-subtitle text-lg text-gray-600">Inventory Management System</p>
                <span className="login-brand-rule" aria-hidden="true" />
                <p className="login-mobile-copy">
                  Welcome back! Sign in to continue managing your inventory with ease.
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="login-form space-y-6">
              <div className="login-field space-y-2">
                <Label htmlFor="username" className="text-gray-800">Username</Label>
                <div className="relative">
                  <User className="login-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="login-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  />
                </div>
              </div>

              <div className="login-field space-y-2">
                <Label htmlFor="password" className="text-gray-800">Password</Label>
                <div className="relative">
                  <Lock className="login-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-field-control login-password-input rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="login-field space-y-2">
                <Label htmlFor="branch" className="text-gray-800">Branch</Label>
                <div className="relative">
                  <Store className="login-field-icon pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Select
                    value={branch}
                    disabled={!isBranchSelectionReady || isAssignedBranchLocked || isCheckingAssignedBranch || isLoggingIn}
                    onValueChange={(value) => {
                      setBranch(value);
                      setAutoSelectedBranch("");
                      if (!username || !password) {
                        toast.error("Please fill the other fields", {
                          id: "login-fill-other-fields",
                          classNames: {
                            toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
                          },
                        });
                        setBranchHintShown(true);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="branch"
                      className="login-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 disabled:opacity-100"
                    >
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Manggahan">Manggahan</SelectItem>
                      <SelectItem value="San Rafael">San Rafael</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {branchNoticeText && (
                  <p className={`flex items-center gap-1.5 text-xs font-medium ${isBranchNoticeError ? "text-red-700" : "text-slate-600"}`}>
                    {isCheckingAssignedBranch ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-500" />
                    ) : isBranchNoticeError ? (
                      <AlertCircle className="h-3 w-3 shrink-0 text-red-600" strokeWidth={2.25} />
                    ) : isBranchNoticeNeutral ? (
                      <Store className="h-3 w-3 shrink-0 text-slate-500" strokeWidth={2.25} />
                    ) : (
                      <CheckCircle className="h-3 w-3 shrink-0 text-green-600" strokeWidth={2.25} />
                    )}
                    <span>
                      {branchNoticeText}
                    </span>
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="login-button w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
                disabled={isLoggingIn || isCheckingAssignedBranch}
              >
                {isLoggingIn || isCheckingAssignedBranch ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {isCheckingAssignedBranch && !isLoggingIn ? "Checking branch..." : "Logging in..."}
                  </>
                ) : (
                  "Login"
                )}
              </Button>

              <div className="login-links mt-4 text-center text-sm">
                <p>
                  <Link to="/forgot-password" className="login-forgot-link text-blue-600 hover:text-blue-700 hover:underline">Forgot Password?</Link>
                </p>
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                  Accounts are created by the Admin / Manager for approved store personnel.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="auth-gradient-pane flex-1 hidden lg:flex flex-col justify-center items-start bg-transparent p-16 relative overflow-hidden">
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
            Established in 2012, E.M. Cayetano Trading provides quality hardware and construction supplies, including cement,
            plywood, nails, hammers, steel bars, and more. Serving customers from our Manggahan and San Rafael branches in
            Rodriguez, Rizal.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Reliable, professional, and dedicated to supporting all your construction and home improvement needs."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
