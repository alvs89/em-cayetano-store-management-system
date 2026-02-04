import React from 'react';
import { useState, useEffect } from "react";
import { CheckCircle, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
const emcLogo = "/emc-logo.png";
import { motion, AnimatePresence } from "motion/react";
export function TwoFactorAuthScreen({
  pendingUser,
  onSuccess,
  onBackToLogin
}) {
  const [state, setState] = useState("code-sent");
  const [code, setCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes in seconds
  const [progressValue, setProgressValue] = useState(0);
  const [isEmailAnimating, setIsEmailAnimating] = useState(true);

  // Correct code for simulation (in real app, this would be verified server-side)
  const CORRECT_CODE = "123456";

  // Timer countdown
  useEffect(() => {
    if (state === "enter-code" && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && state === "enter-code") {
      setState("error");
      toast.error("Verification code expired", {
        description: "Please request a new code."
      });
    }
  }, [state, timeLeft]);

  // Auto-transition from code-sent to enter-code after 2 seconds
  useEffect(() => {
    if (state === "code-sent") {
      const timeout = setTimeout(() => {
        setState("enter-code");
        setIsEmailAnimating(false);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  // Progress bar animation for success state
  useEffect(() => {
    if (state === "success") {
      const interval = setInterval(() => {
        setProgressValue(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 4;
        });
      }, 50);
      const redirectTimeout = setTimeout(() => {
        onSuccess(pendingUser);
      }, 2500);
      return () => {
        clearInterval(interval);
        clearTimeout(redirectTimeout);
      };
    }
  }, [state, pendingUser, onSuccess]);
  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }
    setState("verifying");

    // Simulate verification delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (code === CORRECT_CODE) {
      setState("success");
      toast.success("Verification successful!");
    } else {
      setState("error");
      toast.error("Invalid verification code", {
        description: "Please check your code and try again."
      });
    }
  };
  const handleResendCode = () => {
    setCode("");
    setTimeLeft(120);
    setState("code-sent");
    setIsEmailAnimating(true);
    toast.success("New verification code sent!", {
      description: `Code sent to ${pendingUser.email}`
    });
  };
  const handleBackToLogin = () => {
    onBackToLogin();
    toast.info("Login cancelled");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex bg-gradient-to-br from-yellow-50 via-white to-orange-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center justify-center p-8"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "w-full max-w-lg rounded-3xl shadow-2xl border border-gray-200 bg-white"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "px-12 py-10 space-y-8"
  }, /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      scale: 0.8,
      opacity: 0
    },
    animate: {
      scale: 1,
      opacity: 1
    },
    transition: {
      duration: 0.5
    },
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("img", {
    src: emcLogo,
    alt: "EMC Logo",
    className: "w-20 h-20 object-contain"
  })), /*#__PURE__*/React.createElement(AnimatePresence, {
    mode: "wait"
  }, state === "code-sent" && /*#__PURE__*/React.createElement(motion.div, {
    key: "code-sent",
    initial: {
      opacity: 0,
      y: 20
    },
    animate: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -20
    },
    transition: {
      duration: 0.5
    },
    className: "space-y-6 text-center"
  }, /*#__PURE__*/React.createElement(motion.div, {
    animate: isEmailAnimating ? {
      scale: [1, 1.2, 1],
      rotate: [0, 10, -10, 0]
    } : {},
    transition: {
      duration: 1.5,
      repeat: isEmailAnimating ? Infinity : 0,
      repeatType: "reverse"
    },
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-24 h-24 rounded-full bg-gradient-to-br from-[#FFFF00] to-[#FF0000] flex items-center justify-center shadow-lg"
  }, /*#__PURE__*/React.createElement(Mail, {
    className: "w-12 h-12 text-white"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-gray-900"
  }, "Verification Code Sent"), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-600"
  }, "A 6-digit verification code has been sent to:"), /*#__PURE__*/React.createElement("p", {
    className: "text-[#FF0000]"
  }, pendingUser.email)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement(Loader2, {
    className: "w-8 h-8 text-[#FFFF00] animate-spin"
  }))), state === "enter-code" && /*#__PURE__*/React.createElement(motion.div, {
    key: "enter-code",
    initial: {
      opacity: 0,
      y: 20
    },
    animate: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -20
    },
    transition: {
      duration: 0.5
    },
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-3"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-gray-900"
  }, "Two-Factor Authentication"), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-600"
  }, "Enter the 6-digit code sent to ", /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-gray-900"
  }, pendingUser.email))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-6"
  }, /*#__PURE__*/React.createElement(InputOTP, {
    maxLength: 6,
    value: code,
    onChange: value => setCode(value)
  }, /*#__PURE__*/React.createElement(InputOTPGroup, null, /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 0,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }), /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 1,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }), /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 2,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }), /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 3,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }), /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 4,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }), /*#__PURE__*/React.createElement(InputOTPSlot, {
    index: 5,
    className: "w-14 h-14 text-xl border-2 border-gray-300 focus:border-[#FFFF00] rounded-xl"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-500"
  }, "Code expires in", " ", /*#__PURE__*/React.createElement("span", {
    className: `${timeLeft < 30 ? "text-[#FF0000]" : "text-gray-800"}`
  }, formatTime(timeLeft))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Button, {
    onClick: handleVerify,
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300",
    disabled: code.length !== 6
  }, "Verify Code"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleResendCode,
    variant: "outline",
    className: "w-full py-6 rounded-xl border-2 border-[#FF0000] text-[#FF0000] hover:bg-red-50 transition-all duration-300"
  }, "Resend Code"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleBackToLogin,
    variant: "ghost",
    className: "w-full text-gray-600 hover:text-gray-900"
  }, /*#__PURE__*/React.createElement(ArrowLeft, {
    className: "w-4 h-4 mr-2"
  }), "Back to Login"))), state === "verifying" && /*#__PURE__*/React.createElement(motion.div, {
    key: "verifying",
    initial: {
      opacity: 0,
      scale: 0.9
    },
    animate: {
      opacity: 1,
      scale: 1
    },
    exit: {
      opacity: 0,
      scale: 0.9
    },
    transition: {
      duration: 0.3
    },
    className: "space-y-6 text-center py-8"
  }, /*#__PURE__*/React.createElement(motion.div, {
    animate: {
      rotate: 360
    },
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear"
    },
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 rounded-full bg-gradient-to-br from-[#FFFF00] to-[#FF0000] flex items-center justify-center shadow-lg"
  }, /*#__PURE__*/React.createElement(Loader2, {
    className: "w-10 h-10 text-white"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-gray-900"
  }, "Verifying Code"), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-600"
  }, "Please wait..."))), state === "error" && /*#__PURE__*/React.createElement(motion.div, {
    key: "error",
    initial: {
      opacity: 0,
      y: 20
    },
    animate: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -20
    },
    transition: {
      duration: 0.5
    },
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-4"
  }, /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      scale: 0
    },
    animate: {
      scale: 1
    },
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 10
    },
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 rounded-full bg-red-100 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-full bg-[#FF0000] flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-4xl text-white"
  }, "\u2715")))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-gray-900"
  }, "Verification Failed"), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-600"
  }, "Invalid or expired code. Please try again."))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Button, {
    onClick: handleResendCode,
    className: "w-full py-6 rounded-xl bg-[#FFFF00] hover:bg-[#e6e600] text-black shadow-lg transition-all duration-300"
  }, "Resend Code"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleBackToLogin,
    variant: "outline",
    className: "w-full py-6 rounded-xl border-2 border-gray-300 hover:bg-gray-50 transition-all duration-300"
  }, /*#__PURE__*/React.createElement(ArrowLeft, {
    className: "w-4 h-4 mr-2"
  }), "Back to Login"))), state === "success" && /*#__PURE__*/React.createElement(motion.div, {
    key: "success",
    initial: {
      opacity: 0,
      scale: 0.9
    },
    animate: {
      opacity: 1,
      scale: 1
    },
    exit: {
      opacity: 0,
      scale: 0.9
    },
    transition: {
      duration: 0.5
    },
    className: "space-y-8 text-center py-4"
  }, /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      scale: 0
    },
    animate: {
      scale: 1
    },
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
      delay: 0.2
    },
    className: "flex justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-12 h-12 text-white"
  })))), /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0,
      y: 20
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      delay: 0.4
    },
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-gray-900"
  }, "Verification Successful!"), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-600"
  }, "Redirecting to ", pendingUser.branch, " dashboard...")), /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0
    },
    animate: {
      opacity: 1
    },
    transition: {
      delay: 0.6
    },
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Progress, {
    value: progressValue,
    className: "h-2"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-500"
  }, progressValue, "% complete"))))))), /*#__PURE__*/React.createElement("div", {
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
  }, "Secure Access"), /*#__PURE__*/React.createElement("div", {
    className: "h-1 w-32 bg-gradient-to-r from-[#FFFF00] to-[#FF0000] rounded-full"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xl text-gray-700 leading-relaxed"
  }, "Two-Factor Authentication ensures your account stays protected with an additional layer of security. Your data and inventory information are safeguarded with industry-standard encryption."), /*#__PURE__*/React.createElement("div", {
    className: "border-l-4 border-[#FF0000] pl-6 py-4 bg-white/40 rounded-r-lg"
  }, /*#__PURE__*/React.createElement("p", {
    className: "italic text-lg text-gray-800"
  }, "\"Protecting your business with advanced security measures.\"")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-full bg-[#FFFF00] flex items-center justify-center flex-shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-black"
  }, "\u2713")), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-700"
  }, "Email verification code")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-full bg-[#FFFF00] flex items-center justify-center flex-shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-black"
  }, "\u2713")), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-700"
  }, "Time-limited access codes")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-full bg-[#FFFF00] flex items-center justify-center flex-shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-black"
  }, "\u2713")), /*#__PURE__*/React.createElement("p", {
    className: "text-gray-700"
  }, "Secure session management"))))));
}

