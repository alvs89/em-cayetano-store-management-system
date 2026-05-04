// App shell: handles routing, auth state (login/2FA), and module navigation.
import { useEffect, useRef, useState } from "react";
import {
  Home,
  Box,
  FileText,
  Search,
  Settings,
  HelpCircle,
  Bell,
  Users,
  LogOut,
  Archive,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { LoginScreen } from "./components/LoginScreen";
import { TwoFactorAuthScreen } from "./components/TwoFactorAuthScreen";
import RegistrationScreen from './components/RegistrationScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import SetPasswordScreen from './components/SetPasswordScreen';
import { Dashboard } from "./components/Dashboard.jsx";
import { InventoryModule } from "./components/InventoryModule";
import { ArchiveModule } from "./components/ArchiveModule";
import { ReportsModule } from "./components/ReportsModule";
import { MaintenanceModule } from "./components/MaintenanceModule";
import { UserManagementModule } from "./components/UserManagementModule";
import { SearchModule } from "./components/SearchModule";
import { HelpModule } from "./components/HelpModule";
import { AlertsModule } from "./components/AlertsModule";
import { Button } from "./components/ui/button";
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

const emcLogoSrc = "/emc-logo.png"; // Place the logo file in public/emc-logo.png

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentScreen, setCurrentScreen] = useState("login");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const { unreadAlertCount } = useData();
  const AUTH_SESSION_KEY = 'authSessionActive';
  // Normalize user fields coming from localStorage/server to a consistent shape
  const normalizeUser = (user) => {
    if (!user) return null;
    return {
      ...user,
      fullName: user.fullName || user.full_name || user.username || "User",
      branch: user.branch || user.branchName || "Branch",
      role: user.role || "User",
      username: user.username || "",
      email: user.email || "",
    };
  };

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const hasActiveSession = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
      const savedUser = localStorage.getItem('user');
      if (hasActiveSession && savedUser && savedUser !== "undefined") {
        return normalizeUser(JSON.parse(savedUser));
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
  const POST_LOGOUT_MSG_KEY = 'postLogoutToast';

  // Called after password+2FA success to enter the app
  const handleLogin = (user) => {
    const normalized = normalizeUser(user);
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('temp_username');
    localStorage.removeItem('temp_email');
    localStorage.removeItem('temp_branch_selected');
    localStorage.removeItem('temp_account_branch');
    localStorage.removeItem('active_branch');
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    setCurrentUser(null);
    window.dispatchEvent(new Event('auth-state-changed'));
    setCurrentScreen("login");
    navigate("/login", { replace: true });
    setShowLogoutDialog(false);
    toast.success("Logged out successfully");
  };

  // Sidebar navigation handler
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
    setIsMobileSidebarOpen(false);
  };

  const activeBranch = localStorage.getItem('active_branch') || currentUser?.branch || '';
  const currentPageTitle = getScreenTitle(currentScreen);

  // Keep unauthenticated browser entry points on the login page without breaking 2FA.
  useEffect(() => {
    const publicPaths = ['/login', '/register', '/forgot-password', '/set-password', '/2fa'];
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
    } else {
      setCurrentScreen("login");
    }
  }, [currentUser]);

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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('active_branch');
        sessionStorage.removeItem(AUTH_SESSION_KEY);
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
      <main className="auth-screen-shell min-h-screen w-full">
        {currentScreen === "login" && (
          <LoginScreen
            onLogin={handleLogin}
            onNavigateTo2FA={handleNavigateTo2FA}
            onForgotPassword={() => setCurrentScreen("forgot-password")}
            onRegister={() => setCurrentScreen("registration")}
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
        {currentScreen === "registration" && (
          <RegistrationScreen onBack={() => setCurrentScreen("login")} />
        )}
      </main>
    );
  }

  const appShellClassName = isMobileViewport
    ? "flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-gray-50"
    : "flex h-screen w-full max-w-full flex-row overflow-hidden bg-gray-50";

  const mainClassName = isMobileViewport
    ? "app-main-content min-w-0 flex-1 overflow-visible"
    : "app-main-content min-w-0 flex-1 overflow-y-auto overflow-x-hidden";

  return (
    <div className={appShellClassName} role="application">
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
              <p className="text-xs text-gray-600">{currentUser.role}</p>
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
          <NavItem
            icon={<Archive className="w-5 h-5" />}
            label="Archive"
            active={currentScreen === "archive"}
            onClick={() => navigateTo("archive")}
            collapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<FileText className="w-5 h-5" />}
            label="Reports"
            active={currentScreen === "reports"}
            onClick={() => navigateTo("reports")}
            collapsed={isSidebarCollapsed}
          />
          <NavItem
            icon={<Bell className="w-5 h-5" />}
            label="Alerts"
            active={currentScreen === "alerts"}
            onClick={() => navigateTo("alerts")}
            badge={unreadAlertCount > 0 ? unreadAlertCount : undefined}
            collapsed={isSidebarCollapsed}
          />

          <Separator className="my-3" />

          {currentUser.role === "Admin" && (
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
        <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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

      <main className={mainClassName} aria-live="polite">
        {currentScreen === "dashboard" && <Dashboard onNavigate={navigateTo} user={currentUser} activeBranch={activeBranch} />}
        {currentScreen === "inventory" && <InventoryModule user={currentUser} onNavigate={navigateTo} />}
        {currentScreen === "archive" && <ArchiveModule user={currentUser} />}
        {currentScreen === "reports" && <ReportsModule user={currentUser} />}
        {currentScreen === "maintenance" && <MaintenanceModule onNavigate={navigateTo} user={currentUser} />}
        {currentScreen === "user-management" && <UserManagementModule />}
        {currentScreen === "search" && <SearchModule user={currentUser} />}
        {currentScreen === "help" && <HelpModule user={currentUser} />}
        {currentScreen === "alerts" && (
          <AlertsModule user={currentUser} onNavigate={navigateTo} />
        )}
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
    maintenance: "Maintenance",
    "user-management": "User Management",
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
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2"
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
              <p className="truncate text-xs text-gray-600">{currentUser.role}</p>
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
          <MobileNavItem icon={<Archive className="h-5 w-5" />} label="Archive" active={currentScreen === "archive"} onClick={() => onNavigate("archive")} />
          <MobileNavItem icon={<FileText className="h-5 w-5" />} label="Reports" active={currentScreen === "reports"} onClick={() => onNavigate("reports")} />
          <MobileNavItem icon={<Bell className="h-5 w-5" />} label="Alerts" active={currentScreen === "alerts"} onClick={() => onNavigate("alerts")} badge={unreadAlertCount} />

          <Separator className="my-4" />

          {currentUser.role === "Admin" && (
            <>
              <MobileNavItem icon={<Settings className="h-5 w-5" />} label="Maintenance" active={currentScreen === "maintenance"} onClick={() => onNavigate("maintenance")} />
              <MobileNavItem icon={<Users className="h-5 w-5" />} label="User Management" active={currentScreen === "user-management"} onClick={() => onNavigate("user-management")} />
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

function MobileNavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      type="button"
      className={`box-border flex min-h-12 w-full max-w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#FFFF00] focus:ring-offset-2 ${
        active ? "bg-[#FFFF00] text-black shadow-md" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
      style={{ width: "100%", maxWidth: "100%" }}
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

  return (
    <span
      className={`${inline ? "ml-auto" : "absolute right-1 top-1 shadow-sm ring-2 ring-white"} flex items-center justify-center rounded-full bg-[#FF0000] text-center text-xs font-semibold leading-none text-white`}
      style={{
        minWidth: label.length === 1 ? "20px" : "28px",
        height: "20px",
        padding: label.length === 1 ? "0" : "0 7px",
        borderRadius: "999px",
      }}
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

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`
        relative w-full flex items-center overflow-visible rounded-lg transition-all
        ${collapsed ? "h-10 justify-center px-0 py-0" : "gap-3 px-3 py-2.5"}
        ${
          active
            ? collapsed
              ? "text-black"
              : "bg-[#FFFF00] text-black shadow-md"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        }
        ${collapsed ? "hover:bg-gray-50" : ""}
      `}
    >
      {collapsed && active && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#FF0000]" aria-hidden="true" />
      )}
      <span
        className={`
          relative flex shrink-0 items-center justify-center overflow-visible transition-all
          ${collapsed ? "h-9 w-9 rounded-xl" : ""}
          ${collapsed && active ? "bg-[#FFFF00] text-black shadow-sm" : ""}
          ${collapsed && !active && hasBadge ? "bg-white shadow-sm ring-1 ring-gray-100" : ""}
        `}
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
          <Route path="/register" element={<RegistrationScreen />} />
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/set-password" element={<SetPasswordScreen />} />
          <Route path="/2fa" element={<TwoFactorAuthScreen />} />

          {/* Protected Routes (Optional - depends if you want direct URL access) */}
          <Route path="/dashboard" element={<AppContent />} />
          <Route path="/inventory" element={<AppContent />} />
          <Route path="/archive" element={<AppContent />} />
          <Route path="/reports" element={<AppContent />} />
          <Route path="/maintenance" element={<AppContent />} />
          <Route path="/user-management" element={<AppContent />} />
          <Route path="/search" element={<AppContent />} />
          <Route path="/help" element={<AppContent />} />
          <Route path="/alerts" element={<AppContent />} />

          {/* Catch-all */}
          <Route path="*" element={<AppContent />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </div>
    </DataProvider>
  );
}
