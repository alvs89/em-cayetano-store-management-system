import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, Eye, EyeOff, AlertCircle, User, Mail, Lock, Store } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { apiUrl } from '../utils/api';
import { PASSWORD_HELP_TEXT, validatePasswordPolicy } from '../utils/passwordPolicy';

const emcLogoSrc = "/emc-logo.png";

const RegistrationScreen = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    branch: 'Manggahan'
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordFieldChange = (field) => (value) => {
    if (value.length > 64) {
      toast.error("Password must not exceed 64 characters.", {
        toastId: `registration-${field}-max-length`,
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }
    handleChange(field)(value);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    const passwordError = validatePasswordPolicy(formData.password, {
      fullName: formData.fullName,
      username: formData.username,
      email: formData.email
    });

    if (passwordError) {
      toast.error(passwordError, {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setLoading(true);
    try {
      await axios.post(apiUrl('/api/auth/register'), {
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: 'Employee',
        branch: formData.branch
      });

      toast.success("Registration submitted! Pending admin approval!", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      localStorage.setItem("registration-submitted-at", Date.now().toString());
      window.dispatchEvent(new Event("registration-submitted"));
      navigate('/');
    } catch (error) {
      toast.error(error.response?.data?.error || "Registration failed", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page auth-gradient-page min-h-screen flex">
      <style>{`
        .register-page {
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

        .register-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .register-field-control {
          padding-left: 3.25rem !important;
        }

        .register-field-icon {
          left: 1.1rem !important;
          width: 1.08rem;
          height: 1.08rem;
        }

        .register-password-control {
          padding-right: 3rem !important;
        }

        .register-brand-rule {
          display: block;
          width: 4.25rem;
          height: 3px;
          margin: 0.75rem auto 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #ffff00, #ff0000);
        }

        .register-helper-copy {
          display: block;
          max-width: 25rem;
          margin: 0.75rem auto 0;
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.45;
        }

        @media (max-width: 1023px) {
          .register-page {
            display: block;
            overflow-x: hidden;
          }

          .register-form-pane {
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

          .register-card {
            width: min(100%, 430px);
            max-width: 430px;
            margin-left: auto;
            margin-right: auto;
            border-radius: 1.25rem;
            border-color: rgba(226, 232, 240, 0.78);
            background: rgba(255, 255, 255, 0.76) !important;
            backdrop-filter: blur(12px);
            box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
          }

          .register-card-content {
            padding: 1rem 1.05rem 1.05rem;
          }

          .register-brand {
            margin-bottom: 1.15rem;
          }

          .register-logo {
            width: 4.55rem;
            height: 4.55rem;
          }

          .register-title {
            font-size: clamp(1.55rem, 7vw, 1.95rem);
            line-height: 1.12;
            font-weight: 500;
          }

          .register-subtitle {
            font-size: 0.95rem;
            line-height: 1.35;
          }

          .register-brand-rule {
            width: 3.5rem;
            height: 3px;
            margin-top: 0.6rem;
          }

          .register-helper-copy {
            max-width: 20rem;
            margin-top: 0.7rem;
            font-size: 0.9rem;
            line-height: 1.42;
          }

          .register-form {
            gap: 0.78rem;
          }

          .register-field {
            gap: 0.5rem;
          }

          .register-field label {
            font-size: 0.88rem;
          }

          .register-field-control {
            min-height: 3rem;
            padding-left: 3.2rem !important;
            font-size: 0.95rem;
            line-height: 1.25;
          }

          .register-field-icon {
            left: 1.05rem !important;
            width: 1.1rem;
            height: 1.1rem;
          }

          .register-password-control {
            padding-right: 2.85rem !important;
          }

          .register-password-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.78rem;
          }

          .register-eye-button {
            width: 2.6rem;
            height: 2.6rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 0.75rem;
          }

          .register-notice {
            gap: 0.75rem;
            padding: 0.85rem 1rem;
            border-radius: 1rem;
          }

          .register-notice p {
            font-size: 0.82rem;
            line-height: 1.45;
          }

          .register-button {
            min-height: 3rem;
            padding-top: 0;
            padding-bottom: 0;
            font-weight: 500;
            font-size: 0.98rem;
          }

          .register-back-link {
            margin-top: 0 !important;
          }
        }

        @media (max-width: 390px) {
          .register-form-pane {
            padding: 0.85rem 0.7rem 0.95rem;
          }

          .register-card-content {
            padding: 0.95rem 0.85rem;
          }

          .register-logo {
            width: 4.2rem;
            height: 4.2rem;
          }
        }
      `}</style>

      <div className="register-form-pane auth-gradient-pane flex-1 flex flex-col items-center justify-center p-12 bg-transparent">
        <Card className="register-card w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="register-card-content px-12 py-10 space-y-8">
            <div className="register-brand">
              <div className="flex justify-center mb-4">
                <img src={emcLogoSrc} alt="EMC Logo" className="register-logo w-20 h-20 object-contain" />
              </div>

              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-[#FF0000]">
                  <UserPlus size={24} className="hidden lg:block" />
                  <h2 className="register-title text-3xl text-gray-900">Create Account</h2>
                </div>
                <p className="register-subtitle text-lg text-gray-600">Join the E.M. Cayetano Trading team.</p>
                <span className="register-brand-rule" aria-hidden="true" />
                <p className="register-helper-copy">
                  Register to access the inventory system. Your account will be reviewed before activation.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegister} className="register-form">
              <div className="register-field space-y-2">
                <Label htmlFor="fullName" className="text-gray-800 flex items-center gap-1">Full Name <span className="text-red-600">*</span></Label>
                <div className="relative">
                  <User className="register-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName')(e.target.value)}
                    placeholder="Juan Dela Cruz"
                    className="register-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="register-field space-y-2">
                <Label htmlFor="username" className="text-gray-800 flex items-center gap-1">Username <span className="text-red-600">*</span></Label>
                <div className="relative">
                  <User className="register-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => handleChange('username')(e.target.value)}
                    placeholder="Username"
                    className="register-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="register-field space-y-2">
                <Label htmlFor="email" className="text-gray-800 leading-none flex items-center gap-1">Email <span className="text-red-600">*</span></Label>
                <div className="relative">
                  <Mail className="register-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email')(e.target.value)}
                    placeholder="you@gmail.com"
                    className="register-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="register-password-grid grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="register-field space-y-2">
                  <Label htmlFor="password" className="text-gray-800 flex items-center gap-1">Password <span className="text-red-600">*</span></Label>
                  <div className="relative">
                    <Lock className="register-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handlePasswordFieldChange('password')(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="new-password"
                      className="register-field-control register-password-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="register-eye-button absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="register-field space-y-2">
                  <Label htmlFor="confirmPassword" className="text-gray-800 flex items-center gap-1">Confirm Password <span className="text-red-600">*</span></Label>
                  <div className="relative">
                    <Lock className="register-field-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => handlePasswordFieldChange('confirmPassword')(e.target.value)}
                      placeholder="Confirm Password"
                      autoComplete="new-password"
                      className="register-field-control register-password-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="register-eye-button absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-1"
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-slate-600">
                {PASSWORD_HELP_TEXT}
              </p>

              <div className="register-field space-y-2">
                <Label htmlFor="branch" className="text-gray-800 flex items-center gap-1">Branch <span className="text-red-600">*</span></Label>
                <div className="relative">
                  <Store className="register-field-icon pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Select value={formData.branch} onValueChange={handleChange('branch')}>
                    <SelectTrigger
                      id="branch"
                      className="register-field-control rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    >
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Manggahan">Manggahan</SelectItem>
                      <SelectItem value="San Rafael">San Rafael</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="register-notice flex items-center gap-4 rounded-2xl border-2 border-yellow-400 bg-yellow-100 px-6 py-4 text-gray-800 shadow-sm">
                <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
                <p className="text-sm font-medium leading-relaxed">
                  Your account will be pending until approved by an administrator. You will receive an email once your account is activated.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="register-button w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300 disabled:opacity-70"
              >
                {loading ? "Creating..." : "Sign Up"}
              </Button>

              <div className="register-back-link text-center text-sm text-gray-600">
                <Link to="/" className="text-blue-600 hover:underline">Back to Login</Link>
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
            <h2 className="text-5xl mb-2 text-gray-900">Join Our Team</h2>
            <div className="h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full" />
          </div>

          <p className="text-xl text-gray-700 leading-relaxed">
            Register for access to the E.M. Cayetano Trading Inventory System. Your account will be reviewed by our administrators before activation.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Become part of a reliable, professional team dedicated to excellence."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationScreen;
