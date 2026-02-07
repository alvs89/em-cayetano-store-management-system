// Login UI: validates inputs, calls backend login, and kicks off 2FA.
import axios from 'axios';
import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { toast } from "sonner";

import { Link, useNavigate } from 'react-router-dom';
import { useData } from "./DataContext";

const emcLogoSrc = "/emc-logo.png";

export function LoginScreen({ onLogin, onNavigateTo2FA, onForgotPassword, onRegister }) {
  const { users } = useData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState("");
  const [branchHintShown, setBranchHintShown] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

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

  // Submit credentials; on success either receive token or trigger 2FA flow
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password || !branch) {
      toast.error(!branch ? "Please fill in all fields, including branch" : "Please fill the other fields", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setIsLoggingIn(true);

    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        username,
        password,
        branch // This must match the selected branch in your dropdown
      });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('active_branch', branch);
        window.location.reload(); 
        return;
      }

      if (response.data.require2fa) {
        const otpResponse = await axios.post('http://localhost:5000/api/auth/send-otp', { username });
        const serverTime = otpResponse.data.serverTime || Date.now();
        const expiresAt = otpResponse.data.expiresAt || new Date(Date.now() + 120000).toISOString();
        localStorage.setItem('otp_issued_at', serverTime.toString());
        localStorage.setItem('otp_expires_at', expiresAt);
        localStorage.setItem('temp_username', response.data.username);
        localStorage.setItem('temp_email', response.data.email);
        localStorage.setItem('temp_branch_selected', branch);
        navigate('/2fa');
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

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50">
        <Card className="w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="px-12 py-10 space-y-8">
            <div className="flex justify-center mb-6">
              <img src={emcLogoSrc} alt="EMC Logo" className="w-24 h-24 object-contain" />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-3xl text-gray-900">E.M. Cayetano Trading</h2>
              <p className="text-lg text-gray-600">Inventory Management System</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-800">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-800">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch" className="text-gray-800">Branch</Label>
                <Select
                  value={branch}
                  onValueChange={(value) => {
                    setBranch(value);
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
                    className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  >
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manggahan">Manggahan</SelectItem>
                    <SelectItem value="San Rafael">San Rafael</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>

              <div className="mt-4 text-center text-sm">
                <p>
                  <Link to="/forgot-password" className="text-blue-600 hover:underline">Forgot Password?</Link>
                </p>
                <p className="mt-2">
                  Don't have an account? <Link to="/register" className="text-blue-600 hover:underline">Register here</Link>
                </p>
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
