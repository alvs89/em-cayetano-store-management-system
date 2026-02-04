import React from 'react';
import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { useData } from './DataContext';
const emcLogo = '/emc-logo.png';
import { hashPassword } from '../utils/algorithms';
export function SetPasswordScreen({
  onSuccess,
  token
}) {
  const {
    users,
    setUsers
  } = useData();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidLink, setIsValidLink] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Password strength criteria
  const [passwordCriteria, setPasswordCriteria] = useState({
    minLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  });

  // Validate link on mount
  useEffect(() => {
    const validateLink = () => {
      setIsValidating(true);

      // Simulate link validation (in a real app, this would verify with backend)
      // For demo purposes, we'll find any pending user or use a mock token
      const mockToken = token || 'demo-token-123';

      // Find a user who needs to set password (pending or recently approved)
      const userNeedingPassword = users.find(u => (u.status === 'Pending' || !u.passwordSet) && (!u.inviteExpiry || new Date(u.inviteExpiry) > new Date()));
      setTimeout(() => {
        if (userNeedingPassword || mockToken === 'demo-token-123') {
          setIsValidLink(true);
          setCurrentUser(userNeedingPassword || null);
        } else {
          setIsValidLink(false);
          setErrorMessage('This link has expired or is invalid. Please request a new password reset link.');
        }
        setIsValidating(false);
      }, 1000);
    };
    validateLink();
  }, [token, users]);

  // Check password strength
  useEffect(() => {
    setPasswordCriteria({
      minLength: newPassword.length >= 8,
      hasUpperCase: /[A-Z]/.test(newPassword),
      hasLowerCase: /[a-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)
    });
  }, [newPassword]);
  const isPasswordStrong = Object.values(passwordCriteria).every(Boolean);
  const handleSubmit = async e => {
    e.preventDefault();
    setErrorMessage('');
    if (!newPassword || !confirmPassword) {
      setErrorMessage('Please fill in all fields');
      return;
    }
    if (!isPasswordStrong) {
      setErrorMessage('Password does not meet security requirements');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    try {
      // 🔒 BCRYPT ALGORITHM: Hash the password before storing
      // Bcrypt uses adaptive hashing with salt for secure password storage
      // SALT_ROUNDS = 10: Good balance between security and performance
      // Each hash is unique even for the same password due to random salt
      const passwordHash = await hashPassword(newPassword);

      // Save hashed password to database
      if (currentUser) {
        setUsers(users.map(u => u.id === currentUser.id ? {
          ...u,
          passwordHash,
          // Store bcrypt hash instead of plain text
          passwordSet: true,
          status: 'Active',
          inviteToken: undefined,
          inviteExpiry: undefined
        } : u));
      }
      toast.success('Password set successfully!', {
        description: 'Your account is now fully activated with secure encryption'
      });
      setIsSuccess(true);
      setTimeout(() => onSuccess(), 3000);
    } catch (error) {
      setErrorMessage('Failed to set password. Please try again.');
      toast.error('Password encryption failed');
    }
  };

  // Show loading state while validating link
  if (isValidating) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex bg-gray-50"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50"
    }, /*#__PURE__*/React.createElement(Card, {
      className: "w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white"
    }, /*#__PURE__*/React.createElement(CardContent, {
      className: "px-12 py-10 space-y-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-center mb-6"
    }, /*#__PURE__*/React.createElement("img", {
      src: emcLogo,
      alt: "EMC Logo",
      className: "w-24 h-24 object-contain"
    })), /*#__PURE__*/React.createElement("div", {
      className: "text-center space-y-4 py-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "animate-spin w-12 h-12 border-4 border-[#FFFF00] border-t-transparent rounded-full mx-auto"
    }), /*#__PURE__*/React.createElement("p", {
      className: "text-lg text-gray-600"
    }, "Validating your link..."))))), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 hidden lg:flex flex-col justify-center items-start bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-16 relative overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "absolute top-0 left-0 w-full h-full opacity-30"
    }, /*#__PURE__*/React.createElement("div", {
      className: "absolute top-10 right-10 w-72 h-72 bg-[#FFFF00] rounded-full blur-3xl"
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute bottom-20 left-10 w-96 h-96 bg-[#FF0000] rounded-full blur-3xl"
    })), /*#__PURE__*/React.createElement("div", {
      className: "max-w-xl space-y-8 relative z-10"
    }, /*#__PURE__*/React.createElement("div", {
      className: "inline-block"
    }, /*#__PURE__*/React.createElement("h2", {
      className: "text-5xl mb-2 text-gray-900"
    }, "Secure Your Account"), /*#__PURE__*/React.createElement("div", {
      className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
    })), /*#__PURE__*/React.createElement("p", {
      className: "text-xl text-gray-700 leading-relaxed"
    }, "Create a strong, secure password to protect your account and ensure safe access to the inventory system."))));
  }

  // Show error if link is invalid
  if (!isValidLink) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex bg-gray-50"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50"
    }, /*#__PURE__*/React.createElement(Card, {
      className: "w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white"
    }, /*#__PURE__*/React.createElement(CardContent, {
      className: "px-12 py-10 space-y-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-center mb-6"
    }, /*#__PURE__*/React.createElement("img", {
      src: emcLogo,
      alt: "EMC Logo",
      className: "w-24 h-24 object-contain"
    })), /*#__PURE__*/React.createElement("div", {
      className: "text-center space-y-6 py-8"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-20 h-20 bg-red-100 rounded-full flex items-center justify-center"
    }, /*#__PURE__*/React.createElement(XCircle, {
      className: "w-12 h-12 text-red-600"
    }))), /*#__PURE__*/React.createElement("h2", {
      className: "text-3xl text-gray-900"
    }, "Link Expired or Invalid"), /*#__PURE__*/React.createElement("p", {
      className: "text-lg text-gray-600"
    }, errorMessage || 'This password reset link has expired or is invalid. Please contact your administrator for a new link.'), /*#__PURE__*/React.createElement(Button, {
      onClick: onSuccess,
      className: "mt-4 bg-[#FFFF00] hover:bg-[#e6e600] text-black"
    }, "Back to Login"))))), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 hidden lg:flex flex-col justify-center items-start bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-16 relative overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "absolute top-0 left-0 w-full h-full opacity-30"
    }, /*#__PURE__*/React.createElement("div", {
      className: "absolute top-10 right-10 w-72 h-72 bg-[#FFFF00] rounded-full blur-3xl"
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute bottom-20 left-10 w-96 h-96 bg-[#FF0000] rounded-full blur-3xl"
    })), /*#__PURE__*/React.createElement("div", {
      className: "max-w-xl space-y-8 relative z-10"
    }, /*#__PURE__*/React.createElement("div", {
      className: "inline-block"
    }, /*#__PURE__*/React.createElement("h2", {
      className: "text-5xl mb-2 text-gray-900"
    }, "Secure Your Account"), /*#__PURE__*/React.createElement("div", {
      className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
    })), /*#__PURE__*/React.createElement("p", {
      className: "text-xl text-gray-700 leading-relaxed"
    }, "Create a strong, secure password to protect your account and ensure safe access to the inventory system."))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex bg-gray-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center justify-center p-12 bg-gradient-to-br from-yellow-50 via-white to-orange-50"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "px-12 py-10 space-y-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center mb-6"
  }, /*#__PURE__*/React.createElement("img", {
    src: emcLogo,
    alt: "EMC Logo",
    className: "w-24 h-24 object-contain"
  })), !isSuccess ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl text-gray-900"
  }, "Set Your Password"), /*#__PURE__*/React.createElement("p", {
    className: "text-lg text-gray-600"
  }, currentUser ? `Welcome, ${currentUser.fullName}! Create a secure password for your account` : 'Create a strong password to activate your account')), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-6"
  }, errorMessage && /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 border border-[#FF0000] text-[#FF0000] px-4 py-3 rounded-xl text-center"
  }, errorMessage), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "newPassword",
    className: "text-gray-800"
  }, "New Password"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "newPassword",
    type: showNewPassword ? 'text' : 'password',
    placeholder: "Enter new password",
    value: newPassword,
    onChange: e => setNewPassword(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowNewPassword(!showNewPassword),
    className: "absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
  }, showNewPassword ? /*#__PURE__*/React.createElement(EyeOff, {
    className: "w-5 h-5"
  }) : /*#__PURE__*/React.createElement(Eye, {
    className: "w-5 h-5"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "confirmPassword",
    className: "text-gray-800"
  }, "Confirm Password"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "confirmPassword",
    type: showConfirmPassword ? 'text' : 'password',
    placeholder: "Confirm new password",
    value: confirmPassword,
    onChange: e => setConfirmPassword(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm pr-10"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowConfirmPassword(!showConfirmPassword),
    className: "absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
  }, showConfirmPassword ? /*#__PURE__*/React.createElement(EyeOff, {
    className: "w-5 h-5"
  }) : /*#__PURE__*/React.createElement(Eye, {
    className: "w-5 h-5"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-700 mb-2"
  }, "Password Requirements:"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-sm"
  }, passwordCriteria.minLength ? /*#__PURE__*/React.createElement(Check, {
    className: "w-4 h-4 text-green-600"
  }) : /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement("span", {
    className: passwordCriteria.minLength ? 'text-green-700' : 'text-gray-600'
  }, "At least 8 characters")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-sm"
  }, passwordCriteria.hasUpperCase ? /*#__PURE__*/React.createElement(Check, {
    className: "w-4 h-4 text-green-600"
  }) : /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement("span", {
    className: passwordCriteria.hasUpperCase ? 'text-green-700' : 'text-gray-600'
  }, "One uppercase letter")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-sm"
  }, passwordCriteria.hasLowerCase ? /*#__PURE__*/React.createElement(Check, {
    className: "w-4 h-4 text-green-600"
  }) : /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement("span", {
    className: passwordCriteria.hasLowerCase ? 'text-green-700' : 'text-gray-600'
  }, "One lowercase letter")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-sm"
  }, passwordCriteria.hasNumber ? /*#__PURE__*/React.createElement(Check, {
    className: "w-4 h-4 text-green-600"
  }) : /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement("span", {
    className: passwordCriteria.hasNumber ? 'text-green-700' : 'text-gray-600'
  }, "One number")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-sm"
  }, passwordCriteria.hasSpecialChar ? /*#__PURE__*/React.createElement(Check, {
    className: "w-4 h-4 text-green-600"
  }) : /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement("span", {
    className: passwordCriteria.hasSpecialChar ? 'text-green-700' : 'text-gray-600'
  }, "One special character (!@#$%^&*)")))), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    disabled: !isPasswordStrong || newPassword !== confirmPassword,
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
  }, "Set Password & Activate Account"))) : /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-6 py-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 bg-green-100 rounded-full flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-12 h-12 text-green-600"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl text-gray-900"
  }, "Password Set Successfully!"), /*#__PURE__*/React.createElement("p", {
    className: "text-lg text-gray-600"
  }, "Your account has been activated. You will be redirected to the login page."))))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 hidden lg:flex flex-col justify-center items-start bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-16 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-full h-full opacity-30"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-10 right-10 w-72 h-72 bg-[#FFFF00] rounded-full blur-3xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-20 left-10 w-96 h-96 bg-[#FF0000] rounded-full blur-3xl"
  })), /*#__PURE__*/React.createElement("div", {
    className: "max-w-xl space-y-8 relative z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-block"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-5xl mb-2 text-gray-900"
  }, "Secure Your Account"), /*#__PURE__*/React.createElement("div", {
    className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xl text-gray-700 leading-relaxed"
  }, "Create a strong, secure password to protect your account and ensure safe access to the inventory system."), /*#__PURE__*/React.createElement("div", {
    className: "border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg"
  }, /*#__PURE__*/React.createElement("p", {
    className: "italic text-lg text-gray-800"
  }, "\"A strong password is your first line of defense in protecting sensitive business data.\"")))));
}

