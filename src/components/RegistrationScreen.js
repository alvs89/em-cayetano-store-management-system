import React from 'react';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { useData } from './DataContext';
const emcLogo = '/emc-logo.png';
import { linearSearch } from '../utils/algorithms';
export function RegistrationScreen({
  onBack
}) {
  const {
    users,
    setUsers
  } = useData();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [branch, setBranch] = useState('');
  const handleSubmit = e => {
    e.preventDefault();
    if (!fullName || !username || !email || !branch) {
      toast.error('Please fill in all fields');
      return;
    }

    // 🔍 LINEAR SEARCH ALGORITHM: Check for duplicate username
    // Time Complexity: O(n) where n is number of users
    // Used for unsorted user data with simple search criteria
    const existingUser = linearSearch(users, u => u.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
      toast.error('Username already exists');
      return;
    }

    // Create new user account (password will be set via email link)
    // Note: No password is stored here - user will set it via Set Password module
    const newUser = {
      id: `${users.length + 1}`,
      fullName,
      username,
      email,
      role: 'Employee',
      branch,
      status: 'Pending',
      createdDate: new Date().toISOString().split('T')[0],
      passwordSet: false
    };
    setUsers([...users, newUser]);
    toast.success('Registration submitted! Pending admin approval.');
    setTimeout(() => onBack(), 2000);
  };
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
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl text-gray-900"
  }, "Create Account"), /*#__PURE__*/React.createElement("p", {
    className: "text-lg text-gray-600"
  }, "Register for E.M. Cayetano Inventory System")), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "fullname",
    className: "text-gray-800"
  }, "Full Name"), /*#__PURE__*/React.createElement(Input, {
    id: "fullname",
    type: "text",
    placeholder: "Juan Dela Cruz",
    value: fullName,
    onChange: e => setFullName(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "username",
    className: "text-gray-800"
  }, "Username"), /*#__PURE__*/React.createElement(Input, {
    id: "username",
    type: "text",
    placeholder: "Choose a username",
    value: username,
    onChange: e => setUsername(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "email",
    className: "text-gray-800"
  }, "Email"), /*#__PURE__*/React.createElement(Input, {
    id: "email",
    type: "email",
    placeholder: "your.email@example.com",
    value: email,
    onChange: e => setEmail(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "branch",
    className: "text-gray-800"
  }, "Branch"), /*#__PURE__*/React.createElement(Select, {
    value: branch,
    onValueChange: setBranch
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "branch",
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select your branch"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "Manggahan"
  }, "Manggahan"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "San Rafael"
  }, "San Rafael")))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-yellow-50 rounded-xl border border-yellow-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-700"
  }, "Your account will be pending until approved by an administrator. You will receive an email once your account is activated.")), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
  }, "Submit Registration"), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "ghost",
    className: "w-full text-[#FF0000] hover:text-[#cc0000] hover:underline flex justify-center items-center transition-all",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(ArrowLeft, {
    className: "w-5 h-5 mr-2"
  }), "Back to Login"))))), /*#__PURE__*/React.createElement("div", {
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
  }, "Join Our Team"), /*#__PURE__*/React.createElement("div", {
    className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xl text-gray-700 leading-relaxed"
  }, "Register for access to the E.M. Cayetano Trading Inventory System. Your account will be reviewed by our administrators before activation."), /*#__PURE__*/React.createElement("div", {
    className: "border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg"
  }, /*#__PURE__*/React.createElement("p", {
    className: "italic text-lg text-gray-800"
  }, "\"Become part of a reliable, professional team dedicated to excellence.\"")))));
}

