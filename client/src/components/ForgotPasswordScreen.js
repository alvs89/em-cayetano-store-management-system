import React from 'react';
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { toast } from "sonner";
const emcLogo = "/emc-logo.png";
export function ForgotPasswordScreen({
  onBack,
  onSuccess
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const handleSubmit = e => {
    e.preventDefault();
    if (!username && !email) {
      toast.error("Please fill in all fields");
      return;
    }
    if (!username) {
      toast.error("Please fill in all fields", {
        description: "Username field must contain your username."
      });
      return;
    }
    if (!email) {
      toast.error("Please fill in all fields", {
        description: "Email field must contain your registered email."
      });
      return;
    }

    // All fields filled, proceed
    setIsSubmitted(true);
    toast.success("Password reset link sent!", {
      description: `Check your email at ${email}`
    });
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
  })), !isSubmitted ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl text-gray-900"
  }, "Forgot Password"), /*#__PURE__*/React.createElement("p", {
    className: "text-lg text-gray-600"
  }, "Enter your details to reset your password")), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "username",
    className: "text-gray-800"
  }, "Username"), /*#__PURE__*/React.createElement(Input, {
    id: "username",
    type: "text",
    placeholder: "Enter your username",
    value: username,
    onChange: e => setUsername(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "email",
    className: "text-gray-800"
  }, "Registered Email"), /*#__PURE__*/React.createElement(Input, {
    id: "email",
    type: "email",
    placeholder: "Enter your registered email",
    value: email,
    onChange: e => setEmail(e.target.value),
    className: "rounded-xl border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm"
  })), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
  }, "Send Reset Link"), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "ghost",
    className: "w-full text-[#FF0000] hover:text-[#cc0000] hover:underline flex justify-center items-center transition-all",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(ArrowLeft, {
    className: "w-5 h-5 mr-2"
  }), "Back to Login"))) : /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-6 py-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-10 h-10 text-green-600",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    d: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl text-gray-900"
  }, "Check Your Email!"), /*#__PURE__*/React.createElement("p", {
    className: "text-lg text-gray-600"
  }, "A password reset link has been sent to ", /*#__PURE__*/React.createElement("strong", null, email)), /*#__PURE__*/React.createElement("div", {
    className: "bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-left space-y-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-800"
  }, /*#__PURE__*/React.createElement("strong", null, "Next Steps:")), /*#__PURE__*/React.createElement("ol", {
    className: "text-sm text-gray-700 space-y-2 ml-4 list-decimal"
  }, /*#__PURE__*/React.createElement("li", null, "Check your email inbox for the password reset link"), /*#__PURE__*/React.createElement("li", null, "Click on the link in the email"), /*#__PURE__*/React.createElement("li", null, "Set your new password"))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-500 italic"
  }, "Didn't receive the email? Check your spam folder or request a new link."), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300",
    onClick: onBack
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
  }, "Password Recovery"), /*#__PURE__*/React.createElement("div", {
    className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xl text-gray-700 leading-relaxed"
  }, "We'll help you recover your account quickly and securely. Please ensure you have access to your registered email address."), /*#__PURE__*/React.createElement("div", {
    className: "border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg"
  }, /*#__PURE__*/React.createElement("p", {
    className: "italic text-lg text-gray-800"
  }, "\"Your security is our priority. We're here to help you regain access.\"")))));
}

