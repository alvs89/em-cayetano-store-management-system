import { useEffect, useState } from "react";
import {
  Package,
  FileText,
  Search,
  Settings,
  HelpCircle,
  Bell,
  Users,
  LogOut,
  Archive,
} from "lucide-react";
import { LoginScreen } from "./components/LoginScreen";
import { TwoFactorAuthScreen } from "./components/TwoFactorAuthScreen";
import { ForgotPasswordScreen } from "./components/ForgotPasswordScreen";
import { SetPasswordScreen } from "./components/SetPasswordScreen";
import { Dashboard } from "./components/Dashboard";
import { InventoryModule } from "./components/InventoryModule";
import { ArchiveModule } from "./components/ArchiveModule";
import { ReportsModule } from "./components/ReportsModule";
import { MaintenanceModule } from "./components/MaintenanceModule";
import { UserManagementModule } from "./components/UserManagementModule";
import { SearchModule } from "./components/SearchModule";
import { HelpModule } from "./components/HelpModule";
import { AlertsModule } from "./components/AlertsModule";
import { RegistrationScreen } from "./components/RegistrationScreen";
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
import { DataProvider } from "./components/DataContext";

const emcLogoSrc = "/emc-logo.png"; // Place the logo file in public/emc-logo.png

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState("login");
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

  // SAFER INITIALIZATION
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      // Only parse if it exists and looks like a real JSON object
      if (savedUser && savedUser !== "undefined") {
        return normalizeUser(JSON.parse(savedUser));
      }
      return null;
    } catch (error) {
      console.error("Error parsing user data:", error);
      // If data is corrupt, clear it so the app doesn't crash next time
      localStorage.removeItem('user');
      return null;
    }
  });
  const [pendingUser, setPendingUser] = useState(null);
  const [alertCount, setAlertCount] = useState(3);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogin = (user) => {
    setCurrentUser(user);
    setCurrentScreen("dashboard");
    toast.success(`Welcome back, ${user.fullName}!`);
  };

  const handleNavigateTo2FA = (user) => {
    setPendingUser(user || null);
    setCurrentScreen("2fa");
  };

  const handle2FASuccess = (user) => {
    setCurrentUser(user);
    setPendingUser(null);
    setCurrentScreen("dashboard");
    toast.success(`Welcome back, ${user.fullName}!`);
  };

  const handleBackToLogin = () => {
    setPendingUser(null);
    setCurrentScreen("login");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentScreen("login");
    setShowLogoutDialog(false);
    toast.success("Logged out successfully");
  };

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  // If a temp username exists from login, force the 2FA screen
  useEffect(() => {
    const tempUser = localStorage.getItem('temp_username');
    if (!currentUser && tempUser) {
      setCurrentScreen("2fa");
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
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

  return (
    <div className="flex h-screen bg-gray-50" role="application">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm" aria-label="Sidebar">
        <header className="p-6 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
          <div className="flex flex-col items-center gap-3 text-center">
            <img src={emcLogoSrc} alt="EMC Logo" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-gray-900">E.M. Cayetano</h1>
              <p className="text-xs text-gray-600">Inventory System</p>
            </div>
          </div>
        </header>

        <section className="p-4 border-b border-gray-200 bg-gradient-to-br from-yellow-50 to-white" aria-label="User details">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-[#FFFF00] text-black">
                {(currentUser.fullName || currentUser.username || "User")
                  .split(" ")
                  .map((namePart) => namePart[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-gray-900">{currentUser.fullName || currentUser.username}</p>
              <p className="text-xs text-gray-600">{currentUser.role}</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">📍 {currentUser.branch}</p>
        </section>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Primary">
          <NavItem
            icon={<Search className="w-5 h-5" />}
            label="Search Products"
            active={currentScreen === "search"}
            onClick={() => navigateTo("search")}
          />
          <NavItem
            icon={<Package className="w-5 h-5" />}
            label="Dashboard"
            active={currentScreen === "dashboard"}
            onClick={() => navigateTo("dashboard")}
          />
          <NavItem
            icon={<Package className="w-5 h-5" />}
            label="Inventory"
            active={currentScreen === "inventory"}
            onClick={() => navigateTo("inventory")}
          />
          <NavItem
            icon={<Archive className="w-5 h-5" />}
            label="Archive"
            active={currentScreen === "archive"}
            onClick={() => navigateTo("archive")}
          />
          <NavItem
            icon={<FileText className="w-5 h-5" />}
            label="Reports"
            active={currentScreen === "reports"}
            onClick={() => navigateTo("reports")}
          />
          <NavItem
            icon={<Bell className="w-5 h-5" />}
            label="Alerts"
            active={currentScreen === "alerts"}
            onClick={() => navigateTo("alerts")}
            badge={alertCount > 0 ? alertCount : undefined}
          />

          <Separator className="my-3" />

          {currentUser.role === "Admin" && (
            <>
              <NavItem
                icon={<Settings className="w-5 h-5" />}
                label="Maintenance"
                active={currentScreen === "maintenance"}
                onClick={() => navigateTo("maintenance")}
              />
              <NavItem
                icon={<Users className="w-5 h-5" />}
                label="User Management"
                active={currentScreen === "user-management"}
                onClick={() => navigateTo("user-management")}
              />
            </>
          )}

          <NavItem
            icon={<HelpCircle className="w-5 h-5" />}
            label="Help"
            active={currentScreen === "help"}
            onClick={() => navigateTo("help")}
          />
        </nav>

        <footer className="p-4 border-t border-gray-200">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-[#FF0000] hover:text-red-700 hover:bg-red-50 transition-all"
            onClick={() => setShowLogoutDialog(true)}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </Button>
        </footer>
      </aside>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
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

      <main className="flex-1 overflow-auto" aria-live="polite">
        {currentScreen === "dashboard" && <Dashboard onNavigate={navigateTo} user={currentUser} />}
        {currentScreen === "inventory" && <InventoryModule user={currentUser} onNavigate={navigateTo} />}
        {currentScreen === "archive" && <ArchiveModule user={currentUser} />}
        {currentScreen === "reports" && <ReportsModule user={currentUser} />}
        {currentScreen === "maintenance" && <MaintenanceModule onNavigate={navigateTo} />}
        {currentScreen === "user-management" && <UserManagementModule />}
        {currentScreen === "search" && <SearchModule user={currentUser} />}
        {currentScreen === "help" && <HelpModule />}
        {currentScreen === "alerts" && (
          <AlertsModule user={currentUser} onNavigate={navigateTo} onAlertCountChange={setAlertCount} />
        )}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
        ${
          active
            ? "bg-[#FFFF00] text-black shadow-md"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        }
      `}
    >
      {icon}
      <span className="flex-1 text-left text-sm">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-[#FF0000] text-white text-xs px-2 py-0.5 rounded-full shadow-sm">{badge}</span>
      )}
    </button>
  );
}

export default function App() {
  return (
    <DataProvider>
      <div className="min-h-screen bg-slate-50">
        <AppContent />
        <Toaster richColors position="top-right" />
      </div>
    </DataProvider>
  );
}
