import axios from 'axios';
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { verifyPassword, linearSearch } from "../utils/algorithms";

const emcLogoSrc = "/emc-logo.png";

export function LoginScreen({ onLogin, onNavigateTo2FA, onForgotPassword, onRegister }) {
  const { users } = useData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return alert("Please fill in all fields");

    setIsLoggingIn(true);

    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { username, password });

      // CASE 1: Instant Login (Dev Admin)
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        window.location.reload(); 
        return;
      }

      // CASE 2: 2FA Required (Everyone else)
      if (response.data.require2fa) {
        // Trigger the email sending now
        await axios.post('http://localhost:5000/api/auth/send-otp', { username });
        
        // SAVE USERNAME PERMANENTLY (The Fix)
        localStorage.setItem('temp_username', response.data.username);
        localStorage.setItem('temp_email', response.data.email);

        // Navigate via parent state to show 2FA screen
        onNavigateTo2FA({
          username: response.data.username,
          email: response.data.email,
        });
      }

    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || "Login Failed");
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
                <Label htmlFor="username" className="text-gray-800">
                  Username
                </Label>
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
                <Label htmlFor="password" className="text-gray-800">
                  Password
                </Label>
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
                <Label htmlFor="branch" className="text-gray-800">
                  Branch
                </Label>
                <Select value={branch} onValueChange={setBranch}>
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

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-[#FF0000] hover:text-[#cc0000] hover:underline transition-all"
                >
                  Forgot Password?
                </button>
                <button
                  type="button"
                  onClick={onRegister}
                  className="text-[#FF0000] hover:text-[#cc0000] hover:underline transition-all"
                >
                  Create Account
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
