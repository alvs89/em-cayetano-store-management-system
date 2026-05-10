import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

const emcLogoSrc = "/emc-logo.png";
const RESEND_WAIT_DESCRIPTION = 'Please wait for the resend code timer to finish before requesting another code.';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSendCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/auth/forgot-password', { email });
      const serverTime = response.data.serverTime || Date.now();
      const expiresAt = response.data.expiresAt || new Date(Date.now() + 120000).toISOString();
      navigate('/set-password', {
        state: {
          email,
          otpIssuedAt: serverTime,
          otpExpiresAt: expiresAt,
          retryAfterSeconds: response.data.retryAfterSeconds || 60,
          remainingAttempts: response.data.remainingAttempts,
        }
      });
    } catch (error) {
      const retryAfterSeconds = error.response?.data?.retryAfterSeconds;
      const remainingAttempts = error.response?.data?.remainingAttempts;
      toast.error(error.response?.data?.error || error.response?.data?.message || "Failed to send code", {
        description: retryAfterSeconds && remainingAttempts !== 0 ? RESEND_WAIT_DESCRIPTION : undefined,
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-page min-h-screen flex bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50">
      <style>{`
        .forgot-page {
          width: 100%;
          min-height: 100dvh;
          min-height: 100svh;
          min-height: 100vh;
          background-color: #fff7ed;
          background-image:
            radial-gradient(circle at 88% 8%, rgba(255, 255, 0, 0.35), transparent 24%),
            radial-gradient(circle at 0% 100%, rgba(255, 0, 0, 0.13), transparent 28%),
            linear-gradient(145deg, #fffbeb 0%, #fff7ed 48%, #fee2e2 100%);
          background-repeat: no-repeat;
          background-size: cover;
        }

        .forgot-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        @media (min-width: 1024px) {
          .forgot-brand-rule {
            display: block;
            width: 4.25rem;
            height: 3px;
            margin: 0.75rem auto 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #ffff00, #ff0000);
          }

          .forgot-mobile-copy {
            display: block;
            max-width: 24rem;
            margin: 0.75rem auto 0;
            color: #475569;
            font-size: 0.95rem;
            line-height: 1.45;
          }

          .forgot-email-control {
            padding-left: 3.25rem !important;
          }

          .forgot-email-icon {
            left: 1.1rem !important;
            width: 1.08rem;
            height: 1.08rem;
          }
        }

        @media (max-width: 1023px) {
          .forgot-page {
            display: block;
            overflow-x: hidden;
          }

          .forgot-form-pane {
            width: 100%;
            min-height: 100dvh;
            min-height: 100svh;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
            padding: 1rem 1rem 1.15rem;
            background: transparent !important;
            overflow-x: hidden;
          }

          .forgot-card {
            width: min(100%, 420px);
            max-width: 420px;
            margin-left: auto;
            margin-right: auto;
            border-radius: 1.25rem;
            border-color: rgba(226, 232, 240, 0.78);
            background: rgba(255, 255, 255, 0.76) !important;
            backdrop-filter: blur(12px);
            box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
          }

          .forgot-card-content {
            padding: 1rem 1.05rem 0.85rem;
          }

          .forgot-brand {
            margin-bottom: 1.55rem;
          }

          .forgot-logo {
            width: 4.65rem;
            height: 4.65rem;
          }

          .forgot-title {
            font-size: clamp(1.55rem, 7vw, 1.9rem);
            line-height: 1.12;
            font-weight: 500;
          }

          .forgot-subtitle {
            font-size: 0.95rem;
            line-height: 1.35;
          }

          .forgot-brand-rule {
            display: block;
            width: 3.5rem;
            height: 3px;
            margin: 0.65rem auto 0;
            border-radius: 999px;
            background: linear-gradient(90deg, #ffff00, #ff0000);
          }

          .forgot-mobile-copy {
            display: block;
            max-width: 19rem;
            margin: 0.75rem auto 0;
            color: #475569;
            font-size: 0.9rem;
            line-height: 1.45;
          }

          .forgot-form {
            gap: 0.75rem;
          }

          .forgot-field {
            gap: 0.55rem;
          }

          .forgot-email-control {
            min-height: 3.05rem;
            padding-left: 3.25rem !important;
            font-size: 0.95rem;
            line-height: 1.25;
          }

          .forgot-email-icon {
            left: 1.05rem !important;
            width: 1.1rem;
            height: 1.1rem;
          }

          .forgot-button {
            min-height: 3rem;
            padding-top: 0;
            padding-bottom: 0;
            font-weight: 500;
            font-size: 0.98rem;
          }

          .forgot-back-link {
            margin-top: 0 !important;
          }
        }

        @media (max-width: 390px) {
          .forgot-form-pane {
            padding: 0.85rem 0.7rem 0.95rem;
          }

          .forgot-card-content {
            padding: 0.95rem 0.85rem 0.8rem;
          }

          .forgot-logo {
            width: 4.25rem;
            height: 4.25rem;
          }
        }
      `}</style>

      <div className="forgot-form-pane flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50">
        <Card className="forgot-card w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="forgot-card-content px-12 py-10 space-y-8">
            <div className="forgot-brand">
              <div className="flex justify-center mb-4">
                <img src={emcLogoSrc} alt="EMC Logo" className="forgot-logo w-20 h-20 object-contain" />
              </div>

              <div className="text-center space-y-2">
                <h2 className="forgot-title text-3xl text-gray-900">Forgot Password</h2>
                <p className="forgot-subtitle text-lg text-gray-600">Enter your email to receive a reset code.</p>
                <span className="forgot-brand-rule" aria-hidden="true" />
                <p className="forgot-mobile-copy">
                  We'll help you recover your account quickly and securely.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendCode} className="forgot-form">
              <div className="forgot-field space-y-2">
                <Label htmlFor="email" className="text-gray-800 flex items-center gap-1">Email <span className="text-red-600">*</span></Label>
                <div className="relative">
                  <Mail className="forgot-email-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="forgot-email-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="forgot-button w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Code"}
              </Button>

              <div className="forgot-back-link text-center text-sm text-gray-600">
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
            <h2 className="text-5xl mb-2 text-gray-900">Password Recovery</h2>
            <div className="h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full" />
          </div>

          <p className="text-xl text-gray-700 leading-relaxed">
            We'll help you recover your account quickly and securely. Please ensure you have access to your registered email address.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Your security is our priority. We're here to help you regain access."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ForgotPasswordScreen;
