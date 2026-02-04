import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Mail } from 'lucide-react';

export function TwoFactorAuthScreen() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // THE FIX: Retrieve from Local Storage instead of Navigation State
  const username = localStorage.getItem('temp_username');
  const email = localStorage.getItem('temp_email');
  const selectedBranch = localStorage.getItem('temp_branch_selected');
  const accountBranch = localStorage.getItem('temp_account_branch');

  useEffect(() => {
    // Debugging Log (Check your Console F12 if this fails!)
    console.log("2FA Screen loaded for user:", username);

    // Security: If no username is found, kick them back to login
    if (!username) {
      alert("Session lost. Please login again.");
      navigate('/');
    }
  }, [username, navigate]);

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
    if (fullCode.length !== 6) return alert("Please enter the full 6-digit code");

    setLoading(true);
    try {
      // 1. Verify with Backend
      const response = await axios.post('http://localhost:5000/api/auth/verify-otp', {
        username,
        code: fullCode
      });

      // 2. Success: Save Token
      const { token, user } = response.data;

      // Branch guard: block if selected branch mismatches account branch
      const resolvedBranch = user?.branch || accountBranch;
      if (selectedBranch && resolvedBranch && selectedBranch !== resolvedBranch) {
        alert("Selected branch does not match your account");
        localStorage.removeItem('temp_username');
        localStorage.removeItem('temp_email');
        localStorage.removeItem('temp_branch_selected');
        localStorage.removeItem('temp_account_branch');
        navigate('/');
        return;
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // 3. CLEANUP (Remove temporary 2FA data)
      localStorage.removeItem('temp_username');
      localStorage.removeItem('temp_email');
      localStorage.removeItem('temp_branch_selected');
      localStorage.removeItem('temp_account_branch');
      
      alert("Verification Successful!");
      window.location.href = '/dashboard'; // Hard reload to ensure state updates

    } catch (error) {
      alert(error.response?.data?.error || "Invalid Code");
      setCode(['', '', '', '', '', '']); // Clear inputs on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-blue-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h2>
          <p className="text-gray-600 mt-2 flex items-center justify-center gap-2">
            <Mail className="w-4 h-4" />
            Code sent to {email || "your email"}
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex justify-between gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                className="w-12 h-12 text-center text-xl border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
          >
            {loading ? "Verifying..." : "Verify Identity"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TwoFactorAuthScreen;