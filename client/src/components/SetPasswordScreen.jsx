import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const SetPasswordScreen = () => {
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  useEffect(() => {
    if (!email) navigate('/forgot-password');
  }, [email, navigate]);

  const handleReset = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/auth/reset-password', {
        email,
        otp,
        newPassword
      });
      alert("Password reset successfully! Please login.");
      navigate('/');
    } catch (error) {
      alert(error.response?.data?.error || "Reset failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-4">Set New Password</h2>
        <p className="text-gray-600 text-center mb-6">Check your email for the code.</p>
        <form onSubmit={handleReset} className="space-y-4">
          <input 
            type="text" 
            placeholder="Enter 6-digit Code" 
            value={otp} 
            onChange={(e) => setOtp(e.target.value)} 
            className="w-full p-3 border rounded-lg"
          />
          <input 
            type="password" 
            placeholder="New Password" 
            value={newPassword} 
            onChange={(e) => setNewPassword(e.target.value)} 
            className="w-full p-3 border rounded-lg"
          />
          <button type="submit" className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700">
            Reset Password
          </button>
        </form>
      </div>
    </div>
  );
};
export default SetPasswordScreen;
