// App shell: handles routing, auth state (login/2FA), and module navigation.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Home,
  Box,
  FileText,
  Search,
  Settings,
  HelpCircle,
  Bell,
  Users,
  ShieldCheck,
  LogOut,
  Archive,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Lock,
  CheckCircle2,
  Eye,
  EyeOff,
  ReceiptText,
  Truck,
} from "lucide-react";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { Separator } from "./components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { toast, Toaster } from "sonner";
import { DataProvider, useData } from "./components/DataContext";
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { apiUrl } from './utils/api';
import { PASSWORD_REQUIREMENTS, validatePasswordPolicy } from './utils/passwordPolicy';
import { canAccessScreen, getRoleLabel, isAdminRole, normalizeRole } from './utils/roles';
import { LoginScreen } from "./components/LoginScreen";
import { TwoFactorAuthScreen } from "./components/TwoFactorAuthScreen";
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import SetPasswordScreen from './components/SetPasswordScreen';
import { Dashboard } from "./components/Dashboard.jsx";
import { InventoryModule } from "./components/InventoryModule";
import { ArchiveModule } from "./components/ArchiveModule";
import { ReportsModule } from "./components/ReportsModule";
import { SalesModule } from "./components/SalesModule";
import { PurchasesModule } from "./components/PurchasesModule";
import { MaintenanceModule } from "./components/MaintenanceModule";
import { UserManagementModule } from "./components/UserManagementModule";
import { AuditTrailModule } from "./components/AuditTrailModule";
import { SearchModule } from "./components/SearchModule";
import { HelpModule } from "./components/HelpModule";
import { AlertsModule } from "./components/AlertsModule";

const emcLogoSrc = "/emc-logo.png"; // Place the logo file in public/emc-logo.png
const emptyPasswordChangeForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};
const hiddenPasswordVisibility = {
  current: false,
  next: false,
  confirm: false,
};
const REQUIRED_PASSWORD_TOAST_ID = 'required-password-change-error';
const AUTH_SESSION_KEY = 'authSessionActive';
const AUTH_LAST_ACTIVITY_KEY = 'authLastActivityAt';
const AUTH_ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const AUTH_EMPLOYEE_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const AUTH_IDLE_WARNING_MS = 60 * 1000;
const AUTH_ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'touchstart', 'focus'];
const getIdleTimeoutMsForRole = role => (
  isAdminRole(role) ? AUTH_ADMIN_IDLE_TIMEOUT_MS : AUTH_EMPLOYEE_IDLE_TIMEOUT_MS
);
const formatDurationMinutes = ms => {
  const minutes = Math.max(1, Math.round(ms / (60 * 1000)));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentScreen, setCurrentScreen] = useState("login");
  const [visitedScreens, setVisitedScreens] = useState(() => new Set(["dashboard"]));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const { unreadAlertCount } = useData();
  // Normalize user fields coming from localStorage/server to a consistent shape
  // so navigation, role checks, and account badges read the same properties.
  const normalizeUser = (user) => {
    if (!user) return null;
    return {
      ...user,
      fullName: user.fullName || user.full_name || user.username || "User",
      branch: user.branch || user.branchName || "Branch",
      role: user.role || "User",
      normalizedRole: normalizeRole(user.role || "User"),
      roleLabel: getRoleLabel(user.role || "User"),
      username: user.username || "",
      email: user.email || "",
      mustChangePassword: Boolean(user.mustChangePassword ?? user.must_change_password),
    };
  };

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const hasActiveSession = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
      const savedUser = localStorage.getItem('user');
      const lastActivityAt = Number(sessionStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || 0);
      if (hasActiveSession && savedUser && savedUser !== "undefined") {
        const parsedUser = JSON.parse(savedUser);
        const sessionExpired = lastActivityAt && Date.now() - lastActivityAt > getIdleTimeoutMsForRole(parsedUser?.role);
        if (sessionExpired) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          sessionStorage.removeItem(AUTH_SESSION_KEY);
          sessionStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
          return null;
        }
        sessionStorage.setItem(AUTH_LAST_ACTIVITY_KEY, Date.now().toString());
        return normalizeUser(parsedUser);
      }
    } catch (error) {
      console.error("Error parsing user data:", error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return null;
  });
  const [pendingUser, setPendingUser] = useState(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [hasShownInvalidationToast, setHasShownInvalidationToast] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState(emptyPasswordChangeForm);
  const [passwordVisibility, setPasswordVisibility] = useState(hiddenPasswordVisibility);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordChangeLogoutDialog, setShowPasswordChangeLogoutDialog] = useState(false);
  const [showIdleWarningDialog, setShowIdleWarningDialog] = useState(false);
  const [idleWarningSecondsLeft, setIdleWarningSecondsLeft] = useState(Math.ceil(AUTH_IDLE_WARNING_MS / 1000));
  const POST_LOGOUT_MSG_KEY = 'postLogoutToast';

  const markSessionActivity = () => {
    sessionStorage.setItem(AUTH_LAST_ACTIVITY_KEY, Date.now().toString());
  };

  const keepSessionActive = () => {
    markSessionActivity();
    setIdleWarningSecondsLeft(Math.ceil(AUTH_IDLE_WARNING_MS / 1000));
    setShowIdleWarningDialog(false);
  };

  const clearAuthStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('temp_username');
    localStorage.removeItem('temp_email');
    localStorage.removeItem('temp_branch_selected');
    localStorage.removeItem('temp_account_branch');
    localStorage.removeItem('active_branch');
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
  };

  // Called after password and 2FA success to establish the browser session and
  // notify shared data providers that authenticated data can be refreshed.
  const handleLogin = (user) => {
    const normalized = normalizeUser(user);
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    markSessionActivity();
    setCurrentUser(normalized);
    window.dispatchEvent(new Event('auth-state-changed'));
    setCurrentScreen("dashboard");
    navigate("/");
    toast.success(`Welcome back, ${normalized.fullName}!`);
  };

  // Transition to 2FA screen after password check
  const handleNavigateTo2FA = (user) => {
    setPendingUser(user || null);
    setCurrentScreen("2fa");
  };

  // Finalize 2FA: store user and land on dashboard
  const handle2FASuccess = (user) => {
    const normalized = normalizeUser(user);
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    markSessionActivity();
    setCurrentUser(normalized);
    setPendingUser(null);
    window.dispatchEvent(new Event('auth-state-changed'));
    setCurrentScreen("dashboard");
    navigate("/dashboard", { replace: true });
    toast.success(`Welcome back, ${normalized.fullName}!`);
  };

  // Reset pending 2FA state and return to login
  const handleBackToLogin = () => {
    setPendingUser(null);
    setCurrentScreen("login");
  };

  // Clear all auth-related storage and return to login
  const handleLogout = () => {
    clearAuthStorage();
    setCurrentUser(null);
    setPasswordChangeForm(emptyPasswordChangeForm);
    setPasswordVisibility(hiddenPasswordVisibility);
    setShowPasswordChangeLogoutDialog(false);
    toast.dismiss(REQUIRED_PASSWORD_TOAST_ID);
    window.dispatchEvent(new Event('auth-state-changed'));
    setCurrentScreen("login");
    navigate("/login", { replace: true });
    setShowLogoutDialog(false);
    toast.success("Logged out successfully");
  };

  const handleRequiredPasswordChange = async (event) => {
    event.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordChangeForm;
    const showPasswordChangeError = (message) => {
      toast.error(message, {
        id: REQUIRED_PASSWORD_TOAST_ID,
        duration: 4500,
        style: {
          zIndex: 2147483647,
          opacity: 1,
          background: '#fef2f2',
          color: '#dc2626',
          borderColor: '#fecaca',
        },
        classNames: {
          toast: '!opacity-100',
          title: '!text-red-600 !opacity-100',
          description: '!text-red-600 !opacity-100',
          icon: '!text-red-600 !opacity-100',
        },
      });
    };

    if (!currentPassword || !newPassword || !confirmPassword) {
      showPasswordChangeError("Please complete all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showPasswordChangeError("Passwords do not match.");
      return;
    }

    const passwordError = validatePasswordPolicy(newPassword, currentUser || {});
    if (passwordError) {
      showPasswordChangeError(passwordError);
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(apiUrl('/api/auth/change-password'), {
        currentPassword,
        newPassword
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const updatedUser = normalizeUser(response.data.user);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      markSessionActivity();
      setCurrentUser(updatedUser);
      setPasswordChangeForm(emptyPasswordChangeForm);
      setPasswordVisibility(hiddenPasswordVisibility);
      toast.dismiss(REQUIRED_PASSWORD_TOAST_ID);
      toast.success("Password changed successfully.");
    } catch (error) {
      showPasswordChangeError(error.response?.data?.error || "Failed to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const hasPendingDashboardInventoryIntent = () =>
    Boolean(
      localStorage.getItem("dashboardInventoryStatusFilter") ||
      localStorage.getItem("dashboardInventoryAction") ||
      localStorage.getItem("dashboardInventoryItemId")
    );

  const resetInventoryNavigationState = () => {
    localStorage.removeItem("dashboardInventoryStatusFilter");
    localStorage.removeItem("dashboardInventoryAction");
    localStorage.removeItem("dashboardInventoryItemId");
    localStorage.removeItem("dashboardSearchStatusFilter");
    localStorage.setItem("dashboardInventoryReset", "true");
    window.dispatchEvent(new CustomEvent("dashboard-inventory-reset"));
  };

  // Central navigation guard enforces role-based access before a module is shown
  // and clears dashboard-driven inventory filters when they are no longer needed.
  const navigateTo = (screen, options = {}) => {
    if (currentUser && !canAccessScreen(currentUser.role, screen)) {
      toast.info("This action is not available for your current role.");
      setCurrentScreen("dashboard");
      setIsMobileSidebarOpen(false);
      return;
    }

    if (
      screen === "inventory" &&
      !options?.preserveInventoryNavigationState &&
      !hasPendingDashboardInventoryIntent()
    ) {
      resetInventoryNavigationState();
    }

    setCurrentScreen(screen);
    setIsMobileSidebarOpen(false);
  };

  const activeBranch = localStorage.getItem('active_branch') || currentUser?.branch || '';
  const currentPageTitle = getScreenTitle(currentScreen);

  // Keep unauthenticated browser entry points on the login page without breaking 2FA.
  useEffect(() => {
    const publicPaths = ['/login', '/forgot-password', '/set-password', '/2fa'];
    const hasPending2FA = Boolean(localStorage.getItem('temp_username'));

    if (!currentUser && !hasPending2FA && !publicPaths.includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
  }, [currentUser, location.pathname, navigate]);

  // If a temp username exists from login, force the 2FA screen
  // If OTP flow is in progress, force 2FA screen
  useEffect(() => {
    const tempUser = localStorage.getItem('temp_username');
    if (!currentUser && tempUser) {
      setCurrentScreen("2fa");
    }
  }, [currentUser]);

  // Ensure a logged-in user lands on the dashboard without needing a manual refresh
  // Keep currentScreen synced to login/dashboard based on auth
  useEffect(() => {
    if (currentUser) {
      setCurrentScreen("dashboard");
      setVisitedScreens(new Set(["dashboard"]));
    } else {
      setCurrentScreen("login");
      setVisitedScreens(new Set(["dashboard"]));
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    // Admin accounts time out sooner because they can approve users, edit
    // permissions, and run maintenance operations.
    markSessionActivity();
    let lastRecordedActivity = Date.now();
    const timeoutMs = getIdleTimeoutMsForRole(currentUser.role);
    const warningMs = Math.min(AUTH_IDLE_WARNING_MS, timeoutMs);
    const refreshActivity = () => {
      const now = Date.now();
      if (now - lastRecordedActivity < 15000) return;
      lastRecordedActivity = now;
      markSessionActivity();
      setShowIdleWarningDialog(false);
      setIdleWarningSecondsLeft(Math.ceil(warningMs / 1000));
    };
    const endExpiredSession = () => {
      const lastActivityAt = Number(sessionStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || 0);
      if (!lastActivityAt) return;
      const idleMs = Date.now() - lastActivityAt;
      const remainingMs = timeoutMs - idleMs;

      if (remainingMs > warningMs) {
        setShowIdleWarningDialog(false);
        setIdleWarningSecondsLeft(Math.ceil(warningMs / 1000));
        return;
      }

      if (remainingMs > 0) {
        setIdleWarningSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
        setShowIdleWarningDialog(true);
        return;
      }

      localStorage.setItem(POST_LOGOUT_MSG_KEY, JSON.stringify({
        title: "Session timed out",
        description: `You were logged out after ${formatDurationMinutes(timeoutMs)} of inactivity.`
      }));
      clearAuthStorage();
      setShowIdleWarningDialog(false);
      setCurrentUser(null);
      setCurrentScreen("login");
      window.dispatchEvent(new Event('auth-state-changed'));
      navigate("/login", { replace: true });
    };

    AUTH_ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, refreshActivity, { passive: true });
    });
    const intervalId = window.setInterval(endExpiredSession, 1000);

    return () => {
      AUTH_ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, refreshActivity);
      });
      window.clearInterval(intervalId);
    };
  }, [currentUser, navigate]);

  useEffect(() => {
    setPasswordChangeForm(emptyPasswordChangeForm);
    setPasswordVisibility(hiddenPasswordVisibility);
    setShowPasswordChangeLogoutDialog(false);
    toast.dismiss(REQUIRED_PASSWORD_TOAST_ID);
  }, [
    currentUser?.id,
    currentUser?.user_id,
    currentUser?.username,
    currentUser?.mustChangePassword,
  ]);

  useEffect(() => {
    if (!currentUser) return;
    const appScreens = new Set([
      "dashboard",
      "inventory",
      "archive",
      "reports",
      "sales",
      "purchases",
      "maintenance",
      "user-management",
      "audit-trail",
      "search",
      "help",
      "alerts",
    ]);

    if (!appScreens.has(currentScreen)) return;

    setVisitedScreens(prev => {
      if (prev.has(currentScreen)) return prev;
      const next = new Set(prev);
      next.add(currentScreen);
      return next;
    });
  }, [currentScreen, currentUser]);

  useEffect(() => {
    if (!currentUser || canAccessScreen(currentUser.role, currentScreen)) return;
    setCurrentScreen("dashboard");
  }, [currentScreen, currentUser]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const handleKeyDown = event => {
      if (event.key === "Escape") {
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncMobileViewport = () => {
      const isMobile = mediaQuery.matches;
      setIsMobileViewport(isMobile);
      if (!isMobile) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncMobileViewport();
    mediaQuery.addEventListener("change", syncMobileViewport);
    return () => mediaQuery.removeEventListener("change", syncMobileViewport);
  }, []);

  // Show any post-logout toast after redirect to login
  useEffect(() => {
    if (currentUser) return;
    const pending = localStorage.getItem(POST_LOGOUT_MSG_KEY);
    if (pending) {
      try {
        const parsed = JSON.parse(pending);
        toast.info(parsed.title || "Notice", { description: parsed.description || "" });
      } catch {
        toast.info(pending);
      }
      localStorage.removeItem(POST_LOGOUT_MSG_KEY);
    }
  }, [currentUser]);

  // Global 401 handler: invalidate session on token version change
  useEffect(() => {
    if (window.__auth401Patched) return;
    window.__auth401Patched = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        clearAuthStorage();
        setCurrentUser(null);
        setCurrentScreen("login");
        navigate("/");
        if (!hasShownInvalidationToast) {
          toast.info("Your permissions have been updated by the Admin. Please log in again to see your new features.");
          setHasShownInvalidationToast(true);
        }
      }
      return response;
    };
  }, [navigate, hasShownInvalidationToast]);

  if (!currentUser) {
    return (
      <main className="auth-screen-shell auth-gradient-surface min-h-screen w-full">
        {currentScreen === "login" && (
          <LoginScreen
            onLogin={handleLogin}
            onNavigateTo2FA={handleNavigateTo2FA}
            onForgotPassword={() => setCurrentScreen("forgot-password")}
          />
        )}
        {currentScreen === "2fa" && (
          <TwoFactorAuthScreen
            pendingUser={pendingUser}
            onSuccess={handle2FASuccess}
            onBackToLogin={handleBackToLogin}
          />
        )}
        {currentScreen === "forgot-password" && (
          <ForgotPasswordScreen
            onBack={() => setCurrentScreen("login")}
            onSuccess={() => setCurrentScreen("set-password")}
          />
        )}
        {currentScreen === "set-password" && (
          <SetPasswordScreen onSuccess={() => setCurrentScreen("login")} />
        )}
      </main>
    );
  }

  const appShellClassName = isMobileViewport
    ? "mobile-app-shell flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-gray-50"
    : "flex h-screen w-full max-w-full flex-row overflow-hidden bg-gray-50";

  const mainClassName = isMobileViewport
    ? "app-main-content min-w-0 flex-1 overflow-visible"
    : "app-main-content min-w-0 flex-1 overflow-y-auto overflow-x-hidden";

  const renderScreenPane = (screen, content) => {
    if (!visitedScreens.has(screen) && currentScreen !== screen) return null;
    const isActive = currentScreen === screen;

    return (
      <section
        key={screen}
        className={isActive ? "block" : "hidden"}
        aria-hidden={!isActive}
      >
        {content}
      </section>
    );
  };

  const requiredPasswordChangeModal = currentUser?.mustChangePassword
    ? createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
        style={{
          zIndex: 2147483000
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="required-password-change-title"
      >
        <form
          onSubmit={handleRequiredPasswordChange}
          className="relative max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          style={{ zIndex: 2147483001 }}
        >
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 id="required-password-change-title" className="text-xl font-bold text-slate-950">Change Temporary Password</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your account was created by an administrator. Please set your own password before continuing.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="required-current-password">Temporary Password</Label>
              <div className="relative">
                <Input
                  id="required-current-password"
                  type={passwordVisibility.current ? "text" : "password"}
                  autoComplete="current-password"
                  value={passwordChangeForm.currentPassword}
                  onChange={event => setPasswordChangeForm(prev => ({ ...prev, currentPassword: event.target.value }))}
                  placeholder="Enter your temporary password"
                  disabled={isChangingPassword}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisibility(prev => ({ ...prev, current: !prev.current }))}
                  className="password-visibility-button absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-800 focus:outline-none"
                  aria-label={passwordVisibility.current ? "Hide temporary password" : "Show temporary password"}
                  disabled={isChangingPassword}
                >
                  {passwordVisibility.current ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="required-new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="required-new-password"
                  type={passwordVisibility.next ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={64}
                  value={passwordChangeForm.newPassword}
                  onChange={event => setPasswordChangeForm(prev => ({ ...prev, newPassword: event.target.value }))}
                  placeholder="Enter new password"
                  disabled={isChangingPassword}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisibility(prev => ({ ...prev, next: !prev.next }))}
                  className="password-visibility-button absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-800 focus:outline-none"
                  aria-label={passwordVisibility.next ? "Hide new password" : "Show new password"}
                  disabled={isChangingPassword}
                >
                  {passwordVisibility.next ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="required-confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="required-confirm-password"
                  type={passwordVisibility.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  maxLength={64}
                  value={passwordChangeForm.confirmPassword}
                  onChange={event => setPasswordChangeForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                  placeholder="Confirm new password"
                  disabled={isChangingPassword}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisibility(prev => ({ ...prev, confirm: !prev.confirm }))}
                  className="password-visibility-button absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-800 focus:outline-none"
                  aria-label={passwordVisibility.confirm ? "Hide confirm password" : "Show confirm password"}
                  disabled={isChangingPassword}
                >
                  {passwordVisibility.confirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-950">Password requirements</p>
              <ul className="password-requirements-list mt-3 text-sm leading-5 text-blue-900">
                {PASSWORD_REQUIREMENTS.map(requirement => (
                  <li key={requirement} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" strokeWidth={2.25} />
                    <span>{requirement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPasswordChangeLogoutDialog(true)}
              disabled={isChangingPassword}
            >
              Logout
            </Button>
            <Button type="submit" disabled={isChangingPassword} className="bg-[#FF0000] text-white hover:bg-[#cc0000]">
              {isChangingPassword ? "Saving..." : "Save New Password"}
            </Button>
          </div>
        </form>
        {showPasswordChangeLogoutDialog && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 px-4 py-6" style={{ zIndex: 2147483002 }}>
            <div className="w-full max-w-lg rounded-lg border-2 border-[#FFFF00] bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-950">Confirm Logout</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Are you sure you want to logout? Your temporary password will still need to be changed the next time you sign in.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-24"
                  onClick={() => setShowPasswordChangeLogoutDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="min-w-24 bg-[#FF0000] text-white hover:bg-[#cc0000]"
                  onClick={() => {
                    setShowPasswordChangeLogoutDialog(false);
                    handleLogout();
                  }}
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    )
    : null;

  return (
    <div className={appShellClassName} role="application">
      {requiredPasswordChangeModal}

      {isMobileViewport && (
        <>
          <MobileTopBar
            title={currentPageTitle}
            unreadAlertCount={unreadAlertCount}
            onOpenSidebar={() => setIsMobileSidebarOpen(true)}
            onAlertsClick={() => navigateTo("alerts")}
          />

          <MobileSidebarDrawer
            open={isMobileSidebarOpen}
            currentUser={currentUser}
            activeBranch={activeBranch}
            currentScreen={currentScreen}
            unreadAlertCount={unreadAlertCount}
            onClose={() => setIsMobileSidebarOpen(false)}
            onNavigate={navigateTo}
            onLogout={() => setShowLogoutDialog(true)}
          />
        </>
      )}

      <aside
        className={`${isMobileViewport ? "hidden" : "flex"} bg-white border-r border-gray-200 flex-col shadow-sm transition-[width] duration-300 ease-in-out ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
        aria-label="Sidebar"
      >
        <header className={`relative border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white ${
          isSidebarCollapsed ? "p-3" : "p-6"
        }`}>
          {isSidebarCollapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mx-auto flex h-10 w-10 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-100"
              onClick={() => setIsSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-100"
              onClick={() => setIsSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex flex-col items-center gap-3 text-center">
            {!isSidebarCollapsed && (
              <img
                src={emcLogoSrc}
                alt="EMC Logo"
                className="w-16 h-16 object-contain transition-all"
              />
            )}
            {!isSidebarCollapsed && (
              <div>
              <h1 className="text-gray-900">E.M. Cayetano</h1>
              <p className="text-xs text-gray-600">Inventory System</p>
            </div>
            )}
          </div>
        </header>

        <section className={`${isSidebarCollapsed ? "p-3" : "p-4"} border-b border-gray-200 bg-gradient-to-br from-yellow-50 to-white`} aria-label="User details">
          <div className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}>
            <UserInitialAvatar user={currentUser} size={isSidebarCollapsed ? "sm" : "md"} />
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-gray-900">{currentUser.fullName || currentUser.username}</p>
              <p className="text-xs text-gray-600">{currentUser.roleLabel || getRoleLabel(currentUser.role)}</p>
            </div>
            )}
          </div>
          {!isSidebarCollapsed && (
            <p className="mt-2 truncate whitespace-nowrap text-xs text-gray-600">
              Branch: {activeBranch || currentUser.branch}
            </p>
          )}
        </section>

        <nav className={`${isSidebarCollapsed ? "px-3 py-5 space-y-2" : "p-4 space-y-1"} flex-1 overflow-y-auto`} aria-label="Primary">
          <NavItem
            icon={<Search className="w-5 h-5" />}
            label="Search Products"
            active={currentScreen === "search"}
            onClick={() => navigateTo("search")}
            collapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<Home className="w-5 h-5" />}
            label="Dashboard"
            active={currentScreen === "dashboard"}
            onClick={() => navigateTo("dashboard")}
            collapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<Box className="w-5 h-5" />}
            label="Inventory"
            active={currentScreen === "inventory"}
            onClick={() => navigateTo("inventory")}
            collapsed={isSidebarCollapsed}
          />
          {canAccessScreen(currentUser.role, "archive") && (
            <NavItem
              icon={<Archive className="w-5 h-5" />}
              label="Archive"
              active={currentScreen === "archive"}
              onClick={() => navigateTo("archive")}
              collapsed={isSidebarCollapsed}
            />
          )}
          {canAccessScreen(currentUser.role, "reports") && (
            <NavItem
              icon={<FileText className="w-5 h-5" />}
              label="Reports"
              active={currentScreen === "reports"}
              onClick={() => navigateTo("reports")}
              collapsed={isSidebarCollapsed}
            />
          )}
          {canAccessScreen(currentUser.role, "sales") && (
            <NavItem
              icon={<ReceiptText className="w-5 h-5" />}
              label="Sales"
              active={currentScreen === "sales"}
              onClick={() => navigateTo("sales")}
              collapsed={isSidebarCollapsed}
            />
          )}
          {canAccessScreen(currentUser.role, "purchases") && (
            <NavItem
              icon={<Truck className="w-5 h-5" />}
              label="Purchases"
              active={currentScreen === "purchases"}
              onClick={() => navigateTo("purchases")}
              collapsed={isSidebarCollapsed}
            />
          )}
          <NavItem
            icon={<Bell className="w-5 h-5" />}
            label="Alerts"
            active={currentScreen === "alerts"}
            onClick={() => navigateTo("alerts")}
            badge={unreadAlertCount > 0 ? unreadAlertCount : undefined}
            collapsed={isSidebarCollapsed}
          />

          <Separator className="my-3" />

          {isAdminRole(currentUser.role) && (
            <>
              <NavItem
                icon={<Settings className="w-5 h-5" />}
                label="Maintenance"
                active={currentScreen === "maintenance"}
                onClick={() => navigateTo("maintenance")}
                collapsed={isSidebarCollapsed}
              />
              <NavItem
                icon={<Users className="w-5 h-5" />}
                label="User Management"
                active={currentScreen === "user-management"}
                onClick={() => navigateTo("user-management")}
                collapsed={isSidebarCollapsed}
              />
              <NavItem
                icon={<ShieldCheck className="w-5 h-5" />}
                label="Audit Trail"
                active={currentScreen === "audit-trail"}
                onClick={() => navigateTo("audit-trail")}
                collapsed={isSidebarCollapsed}
              />
            </>
          )}

          <NavItem
            icon={<HelpCircle className="w-5 h-5" />}
            label="Help"
            active={currentScreen === "help"}
            onClick={() => navigateTo("help")}
            collapsed={isSidebarCollapsed}
          />
        </nav>

        <footer className={`${isSidebarCollapsed ? "p-3" : "p-4"} border-t border-gray-200`}>
          <Button
            type="button"
            variant="ghost"
            className={`w-full text-[#FF0000] hover:text-red-700 hover:bg-red-50 transition-all ${
              isSidebarCollapsed ? "justify-center px-0" : "justify-start"
            }`}
            onClick={() => setShowLogoutDialog(true)}
            title="Logout"
          >
            <LogOut className={`w-5 h-5 ${isSidebarCollapsed ? "" : "mr-3"}`} />
            {!isSidebarCollapsed && "Logout"}
          </Button>
        </footer>
      </aside>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent
          className="bg-white rounded-lg border-2 border-[#FFFF00] p-6 shadow-none outline-none ring-0 max-w-lg before:hidden"
          style={{ borderColor: '#FFFF00' }}
        >
          <AlertDialogHeader showBrand={false}>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout? You will need to login again to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} className="bg-[#FF0000] hover:bg-[#cc0000]">
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showIdleWarningDialog} onOpenChange={setShowIdleWarningDialog}>
        <AlertDialogContent
          className="session-timeout-dialog rounded-xl border-2 border-[#FFFF00] bg-white p-0 shadow-xl outline-none ring-0 before:hidden"
          style={{ borderColor: '#FFFF00' }}
        >
          <style>{`
            .session-timeout-dialog {
              width: min(92vw, 540px) !important;
              max-width: 540px !important;
            }

            .session-timeout-body {
              padding: 30px 32px 28px;
            }

            .session-timeout-title {
              font-size: 26px;
              line-height: 1.2;
              font-weight: 700;
              color: #0f172a;
              letter-spacing: 0;
            }

            .session-timeout-message {
              margin-top: 14px;
              max-width: 460px;
              font-size: 16px;
              line-height: 1.65;
              color: #334155;
            }

            .session-timeout-actions {
              display: flex;
              justify-content: flex-end;
              align-items: center;
              gap: 12px;
              margin-top: 28px;
            }

            .session-timeout-button {
              width: auto !important;
              min-width: 138px;
              min-height: 44px;
              border-radius: 10px;
              padding: 0 18px;
              font-size: 15px;
            }

            @media (max-width: 520px) {
              .session-timeout-dialog {
                width: calc(100vw - 28px) !important;
              }

              .session-timeout-body {
                padding: 24px 20px 20px;
              }

              .session-timeout-title {
                font-size: 22px;
              }

              .session-timeout-message {
                margin-top: 12px;
                font-size: 15px;
                line-height: 1.6;
              }

              .session-timeout-actions {
                flex-direction: column-reverse;
                align-items: stretch;
                margin-top: 24px;
              }

              .session-timeout-button {
                width: 100% !important;
              }
            }
          `}</style>
          <div className="session-timeout-body">
            <AlertDialogTitle className="session-timeout-title text-left">
              Session Expiring Soon
            </AlertDialogTitle>
            <AlertDialogDescription className="session-timeout-message text-left">
              You have been inactive for a while. Your session will expire in {idleWarningSecondsLeft} second{idleWarningSecondsLeft === 1 ? '' : 's'}.
              Do you want to stay logged in?
            </AlertDialogDescription>

            <div className="session-timeout-actions">
              <AlertDialogCancel
                onClick={handleLogout}
                className="session-timeout-button"
              >
                Log Out Now
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={keepSessionActive}
                className="session-timeout-button bg-[#FF0000] text-white hover:bg-[#cc0000]"
              >
                Stay Logged In
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <main className={mainClassName} aria-live="polite">
        {renderScreenPane("dashboard", <Dashboard onNavigate={navigateTo} user={currentUser} activeBranch={activeBranch} />)}
        {renderScreenPane("inventory", <InventoryModule user={currentUser} onNavigate={navigateTo} />)}
        {canAccessScreen(currentUser.role, "archive") && renderScreenPane("archive", <ArchiveModule user={currentUser} />)}
        {canAccessScreen(currentUser.role, "reports") && renderScreenPane("reports", <ReportsModule user={currentUser} onNavigate={navigateTo} />)}
        {canAccessScreen(currentUser.role, "sales") && renderScreenPane("sales", <SalesModule user={currentUser} />)}
        {canAccessScreen(currentUser.role, "purchases") && renderScreenPane("purchases", <PurchasesModule user={currentUser} onNavigate={navigateTo} />)}
        {isAdminRole(currentUser.role) && currentScreen === "maintenance" && (
          <MaintenanceModule onNavigate={navigateTo} user={currentUser} />
        )}
        {isAdminRole(currentUser.role) && renderScreenPane("user-management", <UserManagementModule />)}
        {isAdminRole(currentUser.role) && renderScreenPane("audit-trail", <AuditTrailModule user={currentUser} />)}
        {renderScreenPane("search", <SearchModule user={currentUser} onNavigate={navigateTo} />)}
        {renderScreenPane("help", <HelpModule user={currentUser} />)}
        {renderScreenPane("alerts", <AlertsModule user={currentUser} onNavigate={navigateTo} />)}
      </main>
    </div>
  );
}

function getScreenTitle(screen) {
  const titles = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    archive: "Archive",
    reports: "Reports",
    sales: "Sales",
    purchases: "Purchases",
    maintenance: "Maintenance",
    "user-management": "User Management",
    "audit-trail": "Audit Trail",
    search: "Search Products",
    help: "Help",
    alerts: "Alerts",
  };

  return titles[screen] || "Dashboard";
}

function getInitials(user) {
  return (user?.fullName || user?.username || "User")
    .split(" ")
    .map(namePart => namePart[0])
    .join("");
}

function UserInitialAvatar({ user, size = "md" }) {
  const sizeClasses = {
    sm: {
      avatar: "h-10 w-10",
      text: "text-sm",
      dotSize: 7,
      dotOffset: "3px",
    },
    md: {
      avatar: "h-11 w-11",
      text: "text-sm",
      dotSize: 8,
      dotOffset: "3px",
    },
    lg: {
      avatar: "h-12 w-12",
      text: "text-base",
      dotSize: 9,
      dotOffset: "3px",
    },
  };
  const selectedSize = sizeClasses[size] || sizeClasses.md;

  return (
    <span className="relative inline-flex shrink-0 overflow-visible rounded-full">
      <Avatar
        className={`${selectedSize.avatar} overflow-visible rounded-full border border-white bg-gradient-to-br from-yellow-100 via-[#FFE16A] to-[#DFA800] p-[2px] shadow-[0_7px_16px_rgba(202,138,4,0.24)] ring-1 ring-yellow-400/55`}
      >
        <AvatarFallback
          className={`${selectedSize.text} h-full w-full rounded-full border border-yellow-200/80 bg-gradient-to-br from-[#FFF7B8] via-[#FFE066] to-[#F0B20A] font-bold text-gray-950 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-2px_4px_rgba(120,53,15,0.13)]`}
          style={{
            background: "linear-gradient(135deg, #FFF3A3 0%, #FFE15A 48%, #F3B30B 100%)",
          }}
        >
          {getInitials(user)}
        </AvatarFallback>
      </Avatar>
      <span
        className="absolute z-20 block rounded-full shadow-[0_1px_3px_rgba(16,185,129,0.35)]"
        style={{
          width: selectedSize.dotSize,
          height: selectedSize.dotSize,
          right: selectedSize.dotOffset,
          bottom: selectedSize.dotOffset,
          backgroundColor: "#10B981",
          border: "1.5px solid #FFFFFF",
          boxSizing: "border-box",
        }}
        aria-hidden="true"
      />
    </span>
  );
}

function MobileTopBar({ title, unreadAlertCount, onOpenSidebar, onAlertsClick }) {
  return (
    <header
      className="mobile-top-bar sticky left-0 right-0 top-0 z-40 flex h-16 w-full max-w-full shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 shadow-sm md:hidden"
    >
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <img src={emcLogoSrc} alt="EMC Logo" className="h-8 w-8 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">E.M. Cayetano</p>
          <p className="truncate text-xs text-gray-500">{title}</p>
        </div>
      </div>

      <button
        type="button"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2"
        onClick={onAlertsClick}
        aria-label="Open alerts"
      >
        <Bell className="h-5 w-5" />
        {unreadAlertCount > 0 && <MobileAlertBadge count={unreadAlertCount} />}
      </button>
    </header>
  );
}

function MobileSidebarDrawer({
  open,
  currentUser,
  activeBranch,
  currentScreen,
  unreadAlertCount,
  onClose,
  onNavigate,
  onLogout,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/55"
        onClick={onClose}
        aria-label="Close navigation backdrop"
      />

      <aside
        className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden rounded-r-3xl bg-white shadow-2xl"
        style={{ width: "min(84vw, 320px)", maxWidth: "calc(100vw - 16px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
      >
        <header className="relative border-b border-gray-100 px-5 pb-5 pt-8 text-center">
          <button
            ref={closeButtonRef}
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={emcLogoSrc} alt="EMC Logo" className="mx-auto h-16 w-16 object-contain" />
          <h1 className="mt-3 text-base font-semibold text-gray-900">E.M. Cayetano</h1>
          <p className="text-xs text-gray-600">Inventory System</p>
        </header>

        <section className="mx-5 mb-4 mt-6 rounded-xl border border-yellow-100 bg-gradient-to-br from-yellow-50 to-white p-4 shadow-sm" aria-label="User details">
          <div className="flex items-center gap-3">
            <UserInitialAvatar user={currentUser} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{currentUser.fullName || currentUser.username}</p>
              <p className="truncate text-xs text-gray-600">{currentUser.roleLabel || getRoleLabel(currentUser.role)}</p>
              <p className="truncate text-xs text-gray-600">{activeBranch || currentUser.branch}</p>
            </div>
          </div>
        </section>

        <nav
          className="flex-1 space-y-1 pb-5 pt-2"
          style={{ paddingLeft: "20px", paddingRight: "20px" }}
          aria-label="Mobile primary navigation"
        >
          <MobileNavItem icon={<Search className="h-5 w-5" />} label="Search Products" active={currentScreen === "search"} onClick={() => onNavigate("search")} />
          <MobileNavItem icon={<Home className="h-5 w-5" />} label="Dashboard" active={currentScreen === "dashboard"} onClick={() => onNavigate("dashboard")} />
          <MobileNavItem icon={<Box className="h-5 w-5" />} label="Inventory" active={currentScreen === "inventory"} onClick={() => onNavigate("inventory")} />
          {canAccessScreen(currentUser.role, "archive") && <MobileNavItem icon={<Archive className="h-5 w-5" />} label="Archive" active={currentScreen === "archive"} onClick={() => onNavigate("archive")} />}
          {canAccessScreen(currentUser.role, "reports") && <MobileNavItem icon={<FileText className="h-5 w-5" />} label="Reports" active={currentScreen === "reports"} onClick={() => onNavigate("reports")} />}
          {canAccessScreen(currentUser.role, "sales") && <MobileNavItem icon={<ReceiptText className="h-5 w-5" />} label="Sales" active={currentScreen === "sales"} onClick={() => onNavigate("sales")} />}
          {canAccessScreen(currentUser.role, "purchases") && <MobileNavItem icon={<Truck className="h-5 w-5" />} label="Purchases" active={currentScreen === "purchases"} onClick={() => onNavigate("purchases")} />}
          <MobileNavItem icon={<Bell className="h-5 w-5" />} label="Alerts" active={currentScreen === "alerts"} onClick={() => onNavigate("alerts")} badge={unreadAlertCount} />

          <Separator className="my-4" />

          {isAdminRole(currentUser.role) && (
            <>
              <MobileNavItem icon={<Settings className="h-5 w-5" />} label="Maintenance" active={currentScreen === "maintenance"} onClick={() => onNavigate("maintenance")} />
              <MobileNavItem icon={<Users className="h-5 w-5" />} label="User Management" active={currentScreen === "user-management"} onClick={() => onNavigate("user-management")} />
              <MobileNavItem icon={<ShieldCheck className="h-5 w-5" />} label="Audit Trail" active={currentScreen === "audit-trail"} onClick={() => onNavigate("audit-trail")} />
            </>
          )}

          <MobileNavItem icon={<HelpCircle className="h-5 w-5" />} label="Help" active={currentScreen === "help"} onClick={() => onNavigate("help")} />
        </nav>

        <footer className="border-t border-gray-100 p-5">
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#FF0000] hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </footer>
      </aside>
    </div>
  );
}

const SIDEBAR_ACTIVE_BG = "#FF6B00";
const SIDEBAR_ACTIVE_TEXT = "#FFFFFF";
const SIDEBAR_ACTIVE_RING = "rgba(255, 107, 0, 0.38)";
const SIDEBAR_ACTIVE_SHADOW = "0 10px 22px rgba(255, 107, 0, 0.24)";

function MobileNavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      type="button"
      className={`box-border flex min-h-12 w-full max-w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        active ? "shadow-md" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
      style={{
        width: "100%",
        maxWidth: "100%",
        ...(active
          ? {
              backgroundColor: SIDEBAR_ACTIVE_BG,
              color: SIDEBAR_ACTIVE_TEXT,
              boxShadow: SIDEBAR_ACTIVE_SHADOW,
              "--tw-ring-color": SIDEBAR_ACTIVE_RING,
            }
          : {
              "--tw-ring-color": SIDEBAR_ACTIVE_RING,
            }),
      }}
      onClick={onClick}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge > 0 && <MobileAlertBadge count={badge} inline />}
    </button>
  );
}

function MobileAlertBadge({ count, inline = false }) {
  const label = count > 99 ? "99+" : count > 9 ? "9+" : String(count);
  const badgeSize = inline
    ? {
        minWidth: label.length === 1 ? "22px" : "30px",
        height: "22px",
        padding: label.length === 1 ? "0" : "0 7px",
        fontSize: "12px",
      }
    : {
        minWidth: label.length === 1 ? "18px" : "30px",
        height: "18px",
        padding: label.length === 1 ? "0" : "0 6px",
        fontSize: label.length === 1 ? "11px" : "10px",
      };

  return (
    <span
      className={`${inline ? "ml-auto shrink-0" : "absolute -right-1 -top-1 shadow-sm ring-2 ring-white"} mobile-alert-badge flex items-center justify-center rounded-full bg-[#FF0000] text-center font-semibold leading-none text-white`}
      style={{
        ...badgeSize,
        borderRadius: "999px",
        whiteSpace: "nowrap",
        overflowWrap: "normal",
        wordBreak: "normal",
        lineHeight: "1",
      }}
      aria-label={`${count} unread alerts`}
    >
      {label}
    </span>
  );
}

function NavItem({ icon, label, active, onClick, badge, collapsed = false }) {
  const hasBadge = badge !== undefined && badge > 0;
  const badgeLabel = badge > 99 ? "99+" : String(badge);
  const collapsedBadgeLabel = badge > 9 ? "9+" : String(badge);
  const collapsedBadgeStyle = {
    minWidth: collapsedBadgeLabel.length === 1 ? "18px" : "21px",
    height: collapsedBadgeLabel.length === 1 ? "18px" : "17px",
    padding: collapsedBadgeLabel.length === 1 ? "0" : "0 5px",
    fontSize: collapsedBadgeLabel.length === 1 ? "10px" : "9px",
    lineHeight: "1",
  };
  const activeStyle = active
    ? {
        backgroundColor: collapsed ? undefined : SIDEBAR_ACTIVE_BG,
        color: SIDEBAR_ACTIVE_TEXT,
        boxShadow: collapsed ? undefined : SIDEBAR_ACTIVE_SHADOW,
        "--tw-ring-color": SIDEBAR_ACTIVE_RING,
      }
    : {
        "--tw-ring-color": SIDEBAR_ACTIVE_RING,
      };
  const collapsedActiveStyle = collapsed && active
    ? {
        backgroundColor: SIDEBAR_ACTIVE_BG,
        color: SIDEBAR_ACTIVE_TEXT,
        boxShadow: "0 8px 18px rgba(255, 107, 0, 0.22)",
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`
        relative w-full flex items-center overflow-visible rounded-lg transition-colors duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        ${collapsed ? "h-10 justify-center px-0 py-0" : "gap-3 px-3 py-2.5"}
        ${
          active
            ? collapsed
              ? ""
              : "shadow-md"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        }
        ${collapsed ? "hover:bg-gray-50" : ""}
      `}
      style={activeStyle}
    >
      {collapsed && active && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#FF0000]" aria-hidden="true" />
      )}
      <span
        className={`
          relative flex shrink-0 items-center justify-center overflow-visible transition-all
          ${collapsed ? "h-9 w-9 rounded-xl" : ""}
          ${collapsed && active ? "shadow-sm" : ""}
          ${collapsed && !active && hasBadge ? "bg-white shadow-sm ring-1 ring-gray-100" : ""}
        `}
        style={collapsedActiveStyle}
      >
        <span className="relative grid h-5 w-5 place-items-center overflow-visible">
          {icon}
        </span>
        {collapsed && hasBadge && (
          <span
            className="pointer-events-none absolute right-0 top-0 z-20 flex translate-x-[45%] -translate-y-[45%] items-center justify-center rounded-full bg-[#FF0000] text-center font-bold text-white shadow-sm ring-[1.5px] ring-white"
            style={collapsedBadgeStyle}
          >
            <span className="block leading-none" style={{ transform: "translateY(-0.75px)" }}>
              {collapsedBadgeLabel}
            </span>
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1 text-left text-sm">{label}</span>}
      {!collapsed && hasBadge && (
        <span className="rounded-full bg-[#FF0000] px-2 py-0.5 text-xs text-white shadow-sm">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}

export default function App() {
  return (
    <DataProvider>
      <div className="min-h-screen bg-slate-50">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<AppContent />} />
          <Route path="/login" element={<AppContent />} />
          <Route path="/register" element={<AppContent />} />
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/set-password" element={<SetPasswordScreen />} />
          <Route path="/2fa" element={<TwoFactorAuthScreen />} />

          {/* Protected Routes (Optional - depends if you want direct URL access) */}
          <Route path="/dashboard" element={<AppContent />} />
          <Route path="/inventory" element={<AppContent />} />
          <Route path="/archive" element={<AppContent />} />
          <Route path="/reports" element={<AppContent />} />
          <Route path="/sales" element={<AppContent />} />
          <Route path="/purchases" element={<AppContent />} />
          <Route path="/maintenance" element={<AppContent />} />
          <Route path="/user-management" element={<AppContent />} />
          <Route path="/search" element={<AppContent />} />
          <Route path="/help" element={<AppContent />} />
          <Route path="/alerts" element={<AppContent />} />

          {/* Catch-all */}
          <Route path="*" element={<AppContent />} />
        </Routes>
        <Toaster
          richColors
          visibleToasts={1}
          position="top-right"
          style={{ zIndex: 2147483647 }}
          toastOptions={{
            style: {
              zIndex: 2147483647,
              opacity: 1,
            },
            classNames: {
              toast: '!z-[2147483647] !opacity-100',
              title: '!opacity-100',
              description: '!opacity-100',
              icon: '!opacity-100',
            },
          }}
        />
      </div>
    </DataProvider>
  );
}
