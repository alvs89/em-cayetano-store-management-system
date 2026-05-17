import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle, Clock, Info, Package, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { useData } from './DataContext';
import { PageHeader } from './PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const formatRelativeTime = value => {
  if (!value) return 'No date available';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'No date available';

  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds} second${diffSeconds === 1 ? '' : 's'} ago`;
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const formatAlertMessage = message => {
  if (!message) return '';
  return message.replace(/\b1 units\b/g, '1 unit');
};

const isWithinNewBadgeWindow = value => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs < NEW_BADGE_WINDOW_MS;
};

const alertResponsiveStyles = `
  .alert-card-timestamp {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .alert-card-time-icon {
    height: 13px;
    width: 13px;
    flex-shrink: 0;
  }

  .alerts-tabs-list {
    display: flex;
    flex-wrap: nowrap;
    width: 100%;
    height: auto;
    justify-content: flex-start;
    gap: 10px;
    overflow-x: auto;
    border-radius: 0;
    background: transparent;
    padding: 0 0 4px;
    scrollbar-width: none;
  }

  .alerts-tabs-list::-webkit-scrollbar {
    display: none;
  }

  .alerts-tabs-list [role="tab"] {
    min-height: 40px;
    flex: 0 0 auto;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #ffffff;
    padding: 0 18px;
    font-size: 14px;
    color: #172033;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
    white-space: nowrap;
  }

  .alerts-tabs-list [role="tab"][data-state="active"] {
    border-color: #ef233c;
    background: #ef233c;
    color: #ffffff;
    box-shadow: 0 8px 16px rgba(239, 35, 60, 0.2);
  }

  .alerts-panel-header {
    align-items: center;
  }

  .alerts-mark-all-button {
    min-height: 40px;
    width: auto;
    flex: 0 0 auto;
    justify-content: center;
    border-radius: 12px;
    padding-left: 18px;
    padding-right: 18px;
    white-space: nowrap;
  }

  .alerts-summary-grid {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
`;

export function AlertsModule({ user, onNavigate }) {
  const {
    alerts,
    unreadAlertCount,
    warningAlertCount,
    infoAlertCount,
    successAlertCount,
    markAlertRead,
    dismissAlert,
    markAllAlertsRead,
    unmarkAllAlertsRead,
    unmarkAlertRead,
  } = useData();
  const [alertToDismiss, setAlertToDismiss] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const isAdmin = user?.role === 'Admin';

  const handleMarkAsRead = id => {
    markAlertRead(id);
    toast.success('Alert marked as read');
  };

  const handleConfirmDismiss = () => {
    if (!alertToDismiss) return;
    dismissAlert(alertToDismiss.id);
    setAlertToDismiss(null);
    toast.success('Alert dismissed');
  };

  const handleUnmarkAsRead = id => {
    unmarkAlertRead(id);
    toast.message('Alert marked as unread');
  };

  const handleGoToRelated = alert => {
    if (!alert.relatedModule) return;

    if (!alert.read) {
      markAlertRead(alert.id);
    }

    if (alert.relatedModule === 'user-management' && alert.title === 'New User Registration') {
      localStorage.setItem('user_management_target_tab', 'pending');
      window.dispatchEvent(new CustomEvent('user-management-target-tab', {
        detail: { tab: 'pending' }
      }));
    }

    if (alert.relatedModule === 'reports' && alert.reportType) {
      localStorage.setItem('reports_target_type', alert.reportType);
      if (alert.reportCategory) {
        localStorage.setItem('reports_target_category', alert.reportCategory);
      }
      window.dispatchEvent(new CustomEvent('reports-target-view', {
        detail: {
          reportType: alert.reportType,
          category: alert.reportCategory || 'all'
        }
      }));
    }
    onNavigate(alert.relatedModule);
  };

  const sortedAlerts = [...alerts].sort((a, b) => {
    const aTime = new Date(a.timestampRaw || a.timestamp || 0).getTime();
    const bTime = new Date(b.timestampRaw || b.timestamp || 0).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });

  const sortedUnreadAlerts = sortedAlerts.filter(alert => !alert.read);
  const sortedWarningAlerts = sortedAlerts.filter(alert => alert.type === 'warning');
  const sortedInfoAlerts = sortedAlerts.filter(alert => alert.type === 'info');
  const alertsByTab = {
    all: sortedAlerts,
    unread: sortedUnreadAlerts,
    warnings: sortedWarningAlerts,
    ...(isAdmin ? { info: sortedInfoAlerts } : {}),
  };
  const activeTabAlerts = alertsByTab[activeTab] || sortedAlerts;
  const activeTabUnreadAlerts = activeTabAlerts.filter(alert => !alert.read);

  useEffect(() => {
    if (!isAdmin && activeTab === 'info') {
      setActiveTab('all');
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    const scrollToTopIfRequested = () => {
      if (localStorage.getItem('alerts_scroll_to_top') !== 'true') return;
      localStorage.removeItem('alerts_scroll_to_top');
      requestAnimationFrame(() => {
        const alertsPage = document.querySelector('.alerts-page');
        const appScrollContainer = alertsPage?.closest('.app-main-content');
        if (appScrollContainer && typeof appScrollContainer.scrollTo === 'function') {
          appScrollContainer.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        alertsPage?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
      });
    };

    const applyTargetTab = tab => {
      const allowedTabs = ['all', 'unread', 'warnings', ...(isAdmin ? ['info'] : [])];
      if (allowedTabs.includes(tab)) {
        setActiveTab(tab);
        scrollToTopIfRequested();
      }
    };

    const storedTargetTab = localStorage.getItem('alerts_target_tab');
    if (storedTargetTab) {
      applyTargetTab(storedTargetTab);
      localStorage.removeItem('alerts_target_tab');
    }

    const handleTargetTab = event => {
      applyTargetTab(event.detail?.tab);
    };

    window.addEventListener('alerts-target-tab', handleTargetTab);
    return () => window.removeEventListener('alerts-target-tab', handleTargetTab);
  }, [isAdmin]);

  const handleMarkAllAsRead = () => {
    if (activeTabUnreadAlerts.length === 0) return;
    markAllAlertsRead(activeTabUnreadAlerts.map(alert => alert.id));
    toast.success(`${activeTabUnreadAlerts.length} alert${activeTabUnreadAlerts.length === 1 ? '' : 's'} marked as read`);
  };

  const handleUnmarkAllAsRead = () => {
    if (activeTabAlerts.length === 0) return;
    unmarkAllAlertsRead(activeTabAlerts.map(alert => alert.id));
    toast.message(`${activeTabAlerts.length} alert${activeTabAlerts.length === 1 ? '' : 's'} marked as unread`);
  };

  const renderAlertCards = list => list.map(alert => (
    <AlertCard
      key={alert.id}
      alert={alert}
      onMarkAsRead={handleMarkAsRead}
      onUnmarkAsRead={handleUnmarkAsRead}
      onDismiss={setAlertToDismiss}
      onGoToRelated={handleGoToRelated}
    />
  ));

  return (
    <div className="alerts-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`${alertResponsiveStyles}
        @media (max-width: 760px) {
          .alerts-page {
            padding: 14px;
          }

          .alerts-page > .mb-8 {
            margin-bottom: 18px;
          }

          .alerts-page > .mb-8 > .relative {
            border-radius: 18px;
            padding: 22px 18px;
          }

          .alerts-page > .mb-8 .h-16.w-16 {
            height: 58px;
            width: 58px;
            border-radius: 16px;
          }

          .alerts-page > .mb-8 .h-8.w-8 {
            height: 28px;
            width: 28px;
          }

          .alerts-page > .mb-8 h1 {
            margin-bottom: 6px;
            font-size: 31px;
            line-height: 1.08;
          }

          .alerts-page > .mb-8 p {
            font-size: 16px;
            line-height: 1.35;
          }

          .alerts-summary-grid {
            grid-template-columns: repeat(2, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
          }

          .alerts-summary-card [data-alert-summary-content] {
            padding: 14px;
          }

          .alerts-summary-card [data-alert-summary-row] {
            align-items: center;
            gap: 8px;
          }

          .alerts-summary-card [data-alert-summary-row] > div:first-child {
            min-width: 0;
          }

          .alerts-summary-card [data-alert-summary-label] {
            font-size: 12px;
            line-height: 1.2;
            overflow-wrap: anywhere;
          }

          .alerts-summary-card [data-alert-summary-value] {
            font-size: 26px;
            line-height: 1.05;
          }

          .alerts-summary-icon {
            height: 42px;
            width: 42px;
            border-radius: 12px;
          }

          .alerts-summary-icon svg {
            height: 21px;
            width: 21px;
          }

          .alerts-panel [data-alerts-header] {
            padding: 18px 16px 10px;
          }

          .alerts-panel-header {
            flex-direction: row;
            align-items: center;
            gap: 12px;
          }

          .alerts-panel-title {
            min-width: 0;
          }

          .alerts-panel-title h3 {
            font-size: 20px;
            line-height: 1.25;
          }

          .alerts-panel-title p {
            margin-top: 4px;
            font-size: 14px;
            line-height: 1.35;
          }

          .alerts-mark-all-button {
            background: #ffffff;
          }

          .alerts-mark-all-button:hover {
            background: #f8fafc;
            border-color: #cbd5e1;
            color: #0f172a;
          }

          .alerts-panel [data-alerts-content] {
            padding: 10px 16px 16px;
          }

          .alerts-tabs-list [role="tab"] {
            font-size: 13px;
          }

          .alerts-tab-content {
            margin-top: 14px;
          }

          .alert-card {
            border-radius: 14px;
            padding: 16px;
          }

          .alert-card-shell {
            gap: 10px;
          }

          .alert-card-icon {
            margin-top: 2px;
          }

          .alert-card-header {
            align-items: flex-start;
            gap: 10px;
          }

          .alert-card-title-row {
            min-width: 0;
            gap: 7px;
          }

          .alert-card-title {
            width: 100%;
            font-size: 17px;
            line-height: 1.25;
            font-weight: 800;
            color: #111827;
          }

          .alert-dismiss-button {
            min-height: 38px;
            min-width: 38px;
            border-radius: 10px;
          }

          .alert-card-message {
            margin-bottom: 12px;
            font-size: 14px;
            line-height: 1.45;
            color: #334155;
            overflow-wrap: anywhere;
          }

          .alert-card-footer {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            border-top: 1px solid rgba(15, 23, 42, 0.12);
            padding-top: 10px;
          }

          .alert-card-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .alert-card-actions button {
            min-height: 40px;
            justify-content: center;
            border-radius: 10px;
          }

          .alert-card-actions .alert-read-button {
            color: #dc2626;
            background: transparent;
          }

          .alert-card-actions .alert-read-button:hover {
            color: #b91c1c;
            background: rgba(255, 255, 255, 0.55);
          }

          .alert-card-actions .alert-view-button {
            background: #111827;
            color: #ffffff;
            box-shadow: 0 8px 14px rgba(15, 23, 42, 0.16);
          }

          .alert-card-actions .alert-view-button:hover {
            background: #1f2937;
          }

          .alerts-empty {
            padding: 34px 12px;
          }

          .alerts-empty svg {
            height: 48px;
            width: 48px;
            margin-bottom: 12px;
          }

          .alerts-dismiss-dialog {
            width: calc(100vw - 24px);
            max-width: 520px;
            padding: 18px;
            border-radius: 14px;
          }
        }

        @media (max-width: 420px) {
          .alerts-page {
            padding: 12px;
          }

          .alerts-page > .mb-8 h1 {
            font-size: 28px;
          }

          .alerts-panel-header {
            flex-direction: column;
            align-items: stretch;
          }

          .alerts-mark-all-button {
            width: 100%;
            min-height: 44px;
          }

          .alerts-mark-all-button:hover {
            background: #f8fafc;
            border-color: #cbd5e1;
            color: #0f172a;
          }

          .alerts-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .alerts-summary-card [data-alert-summary-content] {
            padding: 12px 10px;
          }

          .alerts-summary-card [data-alert-summary-label] {
            font-size: 11px;
          }

          .alerts-summary-card [data-alert-summary-value] {
            font-size: 24px;
          }

          .alerts-summary-icon {
            height: 36px;
            width: 36px;
          }

          .alerts-summary-icon svg {
            height: 19px;
            width: 19px;
          }

          .alert-card-actions {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 340px) {
          .alerts-summary-grid {
            grid-template-columns: 1fr;
          }

          .alerts-summary-card [data-alert-summary-content] {
            padding: 12px;
          }
        }
      `}</style>
      <PageHeader
        title="Alerts & Notifications"
        subtitle="Stay updated with important system events and real-time inventory alerts"
        icon={<Bell className="h-8 w-8" />}
      />

      <div className={`alerts-summary-grid mb-6 grid grid-cols-1 gap-6 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        <SummaryCard label="Total Alerts" value={alerts.length} icon={<Bell className="h-6 w-6 text-blue-600" />} iconClassName="bg-blue-100" />
        <SummaryCard label="Unread" value={unreadAlertCount} icon={<Bell className="h-6 w-6 text-orange-600" />} iconClassName="bg-orange-100" />
        <SummaryCard label="Warnings" value={warningAlertCount} icon={<AlertTriangle className="h-6 w-6 text-red-600" />} iconClassName="bg-red-100" />
        {isAdmin && (
          <SummaryCard label="Info" value={infoAlertCount + successAlertCount} icon={<Info className="h-6 w-6 text-teal-600" />} iconClassName="bg-teal-100" />
        )}
      </div>

      <Card className="alerts-panel">
        <CardHeader data-alerts-header>
          <div className="alerts-panel-header flex items-center justify-between gap-4">
            <div className="alerts-panel-title">
              <CardTitle>Notifications</CardTitle>
              <CardDescription>All system alerts and notifications</CardDescription>
            </div>
            {activeTabAlerts.length > 0 && (
              activeTabUnreadAlerts.length > 0 ? (
                <Button variant="outline" onClick={handleMarkAllAsRead} className="alerts-mark-all-button shadow-md">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark All as Read
                </Button>
              ) : (
                <Button variant="outline" onClick={handleUnmarkAllAsRead} className="alerts-mark-all-button shadow-md">
                  <Bell className="mr-2 h-4 w-4" />
                  Unmark All as Read
                </Button>
              )
            )}
          </div>
        </CardHeader>

        <CardContent data-alerts-content>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="alerts-tabs-list mb-4">
              <TabsTrigger value="all">All ({alerts.length})</TabsTrigger>
              <TabsTrigger value="unread">Unread ({unreadAlertCount})</TabsTrigger>
              <TabsTrigger value="warnings">Warnings ({warningAlertCount})</TabsTrigger>
              {isAdmin && <TabsTrigger value="info">Info ({infoAlertCount})</TabsTrigger>}
            </TabsList>

            <TabsContent value="all" className="alerts-tab-content space-y-3">
              {alerts.length === 0 ? (
                <EmptyAlerts icon={<Bell className="mx-auto mb-4 h-16 w-16 text-slate-300" />} message="No alerts to display" />
              ) : renderAlertCards(sortedAlerts)}
            </TabsContent>

            <TabsContent value="unread" className="alerts-tab-content space-y-3">
              {unreadAlertCount === 0 ? (
                <EmptyAlerts icon={<CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-300" />} message="All caught up! No unread alerts." />
              ) : renderAlertCards(sortedUnreadAlerts)}
            </TabsContent>

            <TabsContent value="warnings" className="alerts-tab-content space-y-3">
              {warningAlertCount === 0 ? (
                <EmptyAlerts icon={<CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-300" />} message="No warnings at this time" />
              ) : renderAlertCards(sortedWarningAlerts)}
            </TabsContent>

            {isAdmin && (
              <TabsContent value="info" className="alerts-tab-content space-y-3">
                {infoAlertCount === 0 ? (
                  <EmptyAlerts icon={<Info className="mx-auto mb-4 h-16 w-16 text-blue-300" />} message="No info alerts at this time" />
                ) : renderAlertCards(sortedInfoAlerts)}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(alertToDismiss)} onOpenChange={open => !open && setAlertToDismiss(null)}>
        <AlertDialogContent className="alerts-dismiss-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <X className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>Dismiss alert?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  This will remove <span className="font-semibold text-slate-900">{alertToDismiss?.title || 'this alert'}</span> from your notifications list.
                  You can still review the related module if the issue needs attention.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDismiss} className="bg-red-600 text-white hover:bg-red-700">
              Dismiss Alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({ label, value, icon, iconClassName }) {
  return (
    <Card className="alerts-summary-card">
      <CardContent className="pt-6" data-alert-summary-content>
        <div className="flex items-center justify-between" data-alert-summary-row>
          <div>
            <p className="mb-1 text-sm text-slate-600" data-alert-summary-label>{label}</p>
            <p className="text-2xl text-slate-900" data-alert-summary-value>{value}</p>
          </div>
          <div className={`alerts-summary-icon flex h-12 w-12 items-center justify-center rounded-lg ${iconClassName}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyAlerts({ icon, message }) {
  return (
    <div className="alerts-empty py-16 text-center">
      {icon}
      <p className="text-slate-400">{message}</p>
    </div>
  );
}

function AlertCard({ alert, onMarkAsRead, onUnmarkAsRead, onDismiss, onGoToRelated }) {
  const getAlertTone = () => {
    if (alert.title === 'Out of Stock') {
      return {
        label: 'Out of Stock',
        ring: 'ring-red-300',
        icon: 'text-red-700',
        badgeStyle: { backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#b91c1c' },
        containerStyle: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
      };
    }

    if (alert.title === 'Low Stock Alert') {
      return {
        label: 'Low Stock',
        ring: 'ring-orange-300',
        icon: 'text-orange-800',
        badgeStyle: { backgroundColor: '#ea580c', color: '#ffffff', borderColor: '#c2410c' },
        containerStyle: { backgroundColor: '#ffedd5', borderColor: '#fdba74' },
      };
    }

    switch (alert.type) {
      case 'warning':
        return {
          label: 'Warning',
          ring: 'ring-orange-300',
          icon: 'text-orange-700',
          badgeStyle: { backgroundColor: '#ea580c', color: '#ffffff', borderColor: '#c2410c' },
          containerStyle: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
        };
      case 'info':
        return {
          label: 'Info',
          ring: 'ring-blue-300',
          icon: 'text-blue-700',
          badgeStyle: { backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#1d4ed8' },
          containerStyle: { backgroundColor: '#dbeafe', borderColor: '#bfdbfe' },
        };
      case 'success':
        return {
          label: 'Success',
          ring: 'ring-emerald-300',
          icon: 'text-emerald-700',
          badgeStyle: { backgroundColor: '#059669', color: '#ffffff', borderColor: '#047857' },
          containerStyle: { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
        };
      default:
        return {
          label: 'Notice',
          ring: 'ring-slate-300',
          icon: 'text-slate-600',
          badgeStyle: { backgroundColor: '#475569', color: '#ffffff', borderColor: '#334155' },
          containerStyle: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
        };
    }
  };

  const tone = getAlertTone();
  const alertTime = alert.timestampRaw || alert.timestamp;
  const [displayTime, setDisplayTime] = useState(() => formatRelativeTime(alertTime || new Date().toISOString()));
  const showNewBadge = !alert.read && isWithinNewBadgeWindow(alertTime);

  useEffect(() => {
    const tick = () => setDisplayTime(formatRelativeTime(alertTime || new Date().toISOString()));
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [alertTime]);

  const icon = (() => {
    switch (alert.type) {
      case 'warning':
        return <AlertTriangle className={`h-5 w-5 ${tone.icon}`} />;
      case 'info':
        return <Info className={`h-5 w-5 ${tone.icon}`} />;
      case 'success':
        return <CheckCircle className={`h-5 w-5 ${tone.icon}`} />;
      default:
        return <Bell className={`h-5 w-5 ${tone.icon}`} />;
    }
  })();

  return (
    <div
      className={`alert-card rounded-lg border p-4 transition-all duration-200 ease-out ${!alert.read ? `ring-2 ${tone.ring}` : ''} ${alert.read ? 'opacity-90' : ''}`}
      style={tone.containerStyle}
    >
      <div className="alert-card-shell flex items-start gap-3">
        <div className="alert-card-icon mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="alert-card-header mb-1 flex items-start justify-between gap-3">
            <div className="alert-card-title-row flex flex-wrap items-center gap-2">
              <h4 className="alert-card-title text-sm">{alert.title}</h4>
              <Badge style={tone.badgeStyle}>{tone.label}</Badge>
              {showNewBadge && (
                <Badge style={{ backgroundColor: '#111827', color: '#ffffff', borderColor: '#111827' }}>
                  New
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="alert-dismiss-button h-6 w-6 p-0 hover:bg-white/50"
              onClick={() => onDismiss(alert)}
              aria-label={`Dismiss ${alert.title}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="alert-card-message mb-2 text-sm text-slate-600">{formatAlertMessage(alert.message)}</p>
          <div className="alert-card-footer flex items-center justify-between gap-3">
            <span className="alert-card-timestamp text-xs text-slate-500">
              <Clock className="alert-card-time-icon" />
              {displayTime}
            </span>
            <div className="alert-card-actions flex gap-2">
              {!alert.read ? (
                <Button size="sm" variant="ghost" className="alert-read-button h-7 text-xs" onClick={() => onMarkAsRead(alert.id)}>
                  Mark as Read
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="alert-read-button h-7 text-xs" onClick={() => onUnmarkAsRead(alert.id)}>
                  Unmark as Read
                </Button>
              )}
              {alert.actionable && alert.relatedModule && (
                <Button
                  size="sm"
                  className="alert-view-button h-7 text-xs"
                  onClick={() => onGoToRelated(alert)}
                  aria-label={`View ${alert.title} and mark as read`}
                  title="View and mark as read"
                >
                  <Package className="mr-1 h-3 w-3" />
                  {alert.actionLabel || 'View'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
