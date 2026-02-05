import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, User, Lock, Building } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

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
  const navigate = useNavigate();

  const handleChange = (field) => (value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
      return;
    }

    setLoading(true);
    try {
      await axios.post('http://localhost:5000/api/auth/register', {
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: 'Employee',
        branch: formData.branch
      });

      toast.success("Account created successfully! Please login.", {
        classNames: {
          toast: "rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900",
        },
      });
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
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50">
        <Card className="w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white">
          <CardContent className="px-12 py-10 space-y-8">
            <div className="flex justify-center mb-4">
              <img src={emcLogoSrc} alt="EMC Logo" className="w-20 h-20 object-contain" />
            </div>

            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-[#FF0000]">
                <UserPlus size={24} />
                <h2 className="text-3xl text-gray-900">Create Account</h2>
              </div>
              <p className="text-lg text-gray-600">Join the E.M. Cayetano Trading team.</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-gray-800 flex items-center gap-1">Full Name <span className="text-red-600">*</span></Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName')(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-800 flex items-center gap-1">Username <span className="text-red-600">*</span></Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleChange('username')(e.target.value)}
                  placeholder="Username"
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-800 leading-none flex items-center gap-1">Email <span className="text-red-600">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email')(e.target.value)}
                  placeholder="you@gmail.com"
                  className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-800 flex items-center gap-1">Password <span className="text-red-600">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password')(e.target.value)}
                    placeholder="Password"
                    className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-gray-800 flex items-center gap-1">Confirm Password <span className="text-red-600">*</span></Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword')(e.target.value)}
                    placeholder="Confirm Password"
                    className="rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch" className="text-gray-800 flex items-center gap-1">Branch <span className="text-red-600">*</span></Label>
                <Select value={formData.branch} onValueChange={handleChange('branch')}>
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
                disabled={loading}
                className="w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300 disabled:opacity-70"
              >
                {loading ? "Creating..." : "Sign Up"}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-600">
              <Link to="/" className="text-blue-600 hover:underline">Back to Login</Link>
            </div>
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
            Create your employee account to manage inventory, sales, and reporting across branches.
          </p>

          <div className="border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg">
            <p className="italic text-lg text-gray-800">
              "Built for reliable operations from Manggahan to San Rafael."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationScreen;
