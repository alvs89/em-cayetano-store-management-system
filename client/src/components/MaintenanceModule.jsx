import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Info,
  Loader2,
  PieChart,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
import { useData } from './DataContext';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const compactDateTime = value => {
  if (!value) return 'No backup recorded yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No backup recorded yet';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const maintenanceActionCopy = {
  clearLogs: {
    title: 'Clear old system logs?',
    label: 'Clear Logs',
    loadingLabel: 'Clearing...',
    toneClass: 'bg-red-600 hover:bg-red-700',
    description:
      'This action should remove old, non-critical system logs only. It must never delete inventory records, user accounts, reports, archived records, backup files, or security audit logs.',
    placeholder:
      'This control is ready for a future logs cleanup endpoint. No records were changed.',
  },
  optimize: {
    title: 'Optimize database?',
    label: 'Optimize',
    loadingLabel: 'Optimizing...',
    toneClass: 'bg-blue-600 hover:bg-blue-700',
    description:
      'This action should run safe maintenance tasks such as analyzing database tables, refreshing statistics, or cleaning temporary data. It should not perform destructive changes.',
    placeholder:
      'This control is ready for a future optimization endpoint. No records were changed.',
  },
  integrity: {
    title: 'Check data integrity now?',
    label: 'Check Now',
    loadingLabel: 'Checking...',
    toneClass: 'bg-blue-600 hover:bg-blue-700',
    description:
      'This action should inspect possible data issues and show a summary. It should not repair or modify records without a separate confirmation.',
    placeholder:
      'This control is ready for a future integrity-check endpoint. No records were changed.',
  },
};

const getFetchErrorMessage = async (res, fallback) => {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return data?.error || data?.message || fallback;
    }
    const text = await res.text();
    return text || fallback;
  } catch {
    return fallback;
  }
};

function IconTile({ children, tone = 'red', className = '' }) {
  const tones = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

function SectionHeading({ icon, tone, title, description }) {
  return (
    <div className="maintenance-section-heading">
      <IconTile tone={tone}>{icon}</IconTile>
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1.5 max-w-xl text-base leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueClassName = '' }) {
  return (
    <div className="maintenance-info-row text-sm">
      <span className="maintenance-info-label text-slate-600">{label}</span>
      <span className={`maintenance-info-value text-right font-medium text-slate-950 ${valueClassName}`}>{value}</span>
    </div>
  );
}

export function MaintenanceModule({ onNavigate, user }) {
  const { auditAction } = useData();
  const fileInputRef = useRef();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingMaintenanceAction, setPendingMaintenanceAction] = useState(null);
  const [activePlaceholderAction, setActivePlaceholderAction] = useState(null);
  const [summary, setSummary] = useState({
    activeUserCount: 0,
    pendingRegistrations: [],
    lastBackupAt: null,
    databaseStatus: 'Checking...'
  });

  const isAdmin = user?.role === 'Admin' || user?.role === 'Owner';

  const loadSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE}/api/system/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSummary(res.data || {});
    } catch (err) {
      console.error('Failed to load maintenance summary:', err);
      setSummary(prev => ({
        ...prev,
        databaseStatus: 'Unavailable'
      }));
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleBackup = async () => {
    if (!isAdmin || isBackingUp) return;
    setIsBackingUp(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/maintenance/backup`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await getFetchErrorMessage(res, 'Backup failed'));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emcayetano-backup-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Database backup downloaded successfully.');
      await loadSummary();
    } catch (err) {
      const description = err.message && err.message !== 'Backup failed' ? err.message : undefined;
      toast.error('Backup failed', description ? { description } : undefined);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedRestoreFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.sql')) {
      toast.error('Restore failed', { description: 'Please select a valid .sql backup file.' });
      setSelectedRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedRestoreFile(file);
    setShowRestoreDialog(true);
  };

  const resetRestoreSelection = () => {
    setSelectedRestoreFile(null);
    setShowRestoreDialog(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmRestore = async () => {
    if (!selectedRestoreFile || !isAdmin || isRestoring) return;
    setIsRestoring(true);
    try {
      const token = localStorage.getItem('token');
      const sql = await selectedRestoreFile.arrayBuffer();
      const res = await fetch(`${API_BASE}/api/maintenance/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sql',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: sql,
      });
      if (!res.ok) throw new Error(await getFetchErrorMessage(res, 'Restore failed'));
      toast.success('Database restored successfully.');
      await loadSummary();
    } catch (err) {
      toast.error('Restore failed', { description: err.message });
    } finally {
      setIsRestoring(false);
      resetRestoreSelection();
    }
  };

  // Placeholder UI actions until dedicated maintenance endpoints are available.
  const requestPlaceholderAction = actionKey => {
    if (!isAdmin || activePlaceholderAction) return;
    setPendingMaintenanceAction(actionKey);
  };

  const confirmPlaceholderAction = async () => {
    if (!pendingMaintenanceAction || activePlaceholderAction) return;
    const action = maintenanceActionCopy[pendingMaintenanceAction];
    setActivePlaceholderAction(pendingMaintenanceAction);
    await new Promise(resolve => window.setTimeout(resolve, 450));
    const auditMap = {
      clearLogs: 'CLEAR_LOGS',
      optimize: 'OPTIMIZE_DATABASE',
      integrity: 'CHECK_DATA_INTEGRITY',
    };
    auditAction?.(auditMap[pendingMaintenanceAction], {
      targetName: action.label,
    });
    toast.info(`${action.label} is not connected yet`, {
      description: action.placeholder,
    });
    setActivePlaceholderAction(null);
    setPendingMaintenanceAction(null);
  };

  const databaseOnline = summary.databaseStatus === 'Online';
  const lastBackup = compactDateTime(summary.lastBackupAt);
  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const appEnvironment = import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'Production';
  const pendingAction = pendingMaintenanceAction ? maintenanceActionCopy[pendingMaintenanceAction] : null;

  return (
    <div className="maintenance-page min-h-screen bg-gray-50">
      <style>{`
        .maintenance-page {
          padding: 24px;
          overflow-x: hidden;
        }

        .maintenance-page,
        .maintenance-page * {
          box-sizing: border-box;
        }

        .maintenance-page > .mb-8,
        .maintenance-layout,
        .maintenance-page > .maintenance-alert-row {
          width: min(100%, 96rem);
          margin-left: auto;
          margin-right: auto;
        }

        .maintenance-hero {
          min-height: 140px;
        }

        .maintenance-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.64fr) minmax(330px, 0.92fr);
          gap: 22px;
          align-items: stretch;
        }

        .maintenance-card-content {
          padding: 26px;
        }

        .maintenance-card-content,
        .maintenance-section-heading,
        .maintenance-action-card,
        .maintenance-optimization-item,
        .maintenance-info-header,
        .maintenance-alert-row {
          min-width: 0;
        }

        .maintenance-section-heading {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .maintenance-section-heading h2,
        .maintenance-section-heading p,
        .maintenance-action-copy,
        .maintenance-meta-value,
        .maintenance-user-list-item span,
        .maintenance-info-value,
        .maintenance-alert-row p,
        .maintenance-alert-row span {
          overflow-wrap: anywhere;
        }

        .maintenance-action-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #eef2f7;
          overflow: hidden;
        }

        .maintenance-action-card {
          min-width: 0;
          min-height: 280px;
          display: grid;
          grid-template-rows: 56px auto minmax(92px, 1fr) auto auto;
          row-gap: 16px;
          padding: 28px;
          background: transparent;
        }

        .maintenance-action-icon {
          margin: 0;
          align-self: start;
        }

        .maintenance-action-copy {
          margin: 0;
          color: #475569;
          font-size: 16px;
          line-height: 1.65;
          max-width: 36ch;
        }

        .maintenance-action-card + .maintenance-action-card {
          border-left: 1px solid #e5e7eb;
        }

        .maintenance-meta-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: baseline;
          gap: 18px;
          font-size: 14px;
        }

        .maintenance-meta-label {
          color: #475569;
        }

        .maintenance-meta-value {
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
          text-align: right;
          line-height: 1.4;
        }

        .maintenance-action-button {
          height: 48px;
          width: 100%;
          border-radius: 10px;
          font-weight: 700;
          box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
        }

        .maintenance-optimization-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
        }

        .maintenance-optimization-item {
          min-width: 0;
          min-height: 240px;
          padding: 0 28px;
          border-left: 1px solid #e5e7eb;
        }

        .maintenance-optimization-item:first-child {
          padding-left: 0;
          border-left: 0;
        }

        .maintenance-optimization-item:last-child {
          padding-right: 0;
        }

        .maintenance-info-list {
          display: grid;
          gap: 18px;
          padding-top: 16px;
          border-top: 1px solid #eef2f7;
        }

        .maintenance-info-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, auto);
          align-items: start;
          gap: 16px;
        }

        .maintenance-info-header {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
          border-radius: 14px;
          background: #f8fafc;
          padding: 16px;
        }

        .maintenance-info-header-icon {
          display: flex;
          width: 48px;
          height: 48px;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: #f3efff;
          color: #5b21b6;
        }

        .maintenance-tool-button {
          height: 44px;
          min-width: 132px;
          max-width: 100%;
          border-radius: 10px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          font-weight: 700;
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.08);
        }

        .maintenance-tool-button:hover {
          border-color: #93c5fd;
          background: #dbeafe;
          color: #1e40af;
        }

        .maintenance-user-card {
          display: grid;
          grid-template-rows: auto 1fr auto;
          min-height: 100%;
        }

        .maintenance-user-list {
          display: grid;
          align-content: start;
          gap: 14px;
          padding-top: 24px;
          font-size: 16px;
          line-height: 1.55;
          color: #1e293b;
        }

        .maintenance-user-list-item {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .maintenance-alert-row {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          padding: 18px 22px;
        }

        @media (max-width: 1180px) {
          .maintenance-layout {
            grid-template-columns: 1fr;
          }

          .maintenance-user-card {
            min-height: auto;
          }

          .maintenance-user-card .mt-10 {
            margin-top: 24px;
          }
        }

        @media (max-width: 760px) {
          .maintenance-page {
            padding: 16px;
          }

          .maintenance-page > .mb-8 {
            margin-bottom: 18px;
          }

          .maintenance-page > .mb-8 > .relative {
            min-height: auto;
            border-radius: 20px;
            padding: 24px;
          }

          .maintenance-page > .mb-8 .flex.min-w-0.items-center {
            align-items: center;
            gap: 16px;
          }

          .maintenance-page > .mb-8 .flex.h-16 {
            width: 64px;
            height: 64px;
            border-radius: 16px;
          }

          .maintenance-page > .mb-8 .flex.h-16 svg {
            width: 32px;
            height: 32px;
          }

          .maintenance-page > .mb-8 .min-w-0[style] {
            margin-left: 0 !important;
          }

          .maintenance-page > .mb-8 h1 {
            font-size: clamp(1.85rem, 7vw, 2.55rem);
            line-height: 1.08;
            margin-bottom: 8px;
          }

          .maintenance-page > .mb-8 p {
            font-size: 0.98rem;
            line-height: 1.38;
          }

          .maintenance-layout {
            gap: 16px;
          }

          .maintenance-card-content {
            padding: 20px;
          }

          .maintenance-section-heading {
            grid-template-columns: 48px minmax(0, 1fr);
            gap: 14px;
          }

          .maintenance-section-heading .h-14 {
            width: 48px;
            height: 48px;
            border-radius: 14px;
          }

          .maintenance-section-heading h2,
          .maintenance-info-header h2 {
            font-size: 1rem;
            line-height: 1.25;
          }

          .maintenance-section-heading p,
          .maintenance-info-header p {
            font-size: 0.92rem;
            line-height: 1.45;
          }

          .maintenance-action-grid,
          .maintenance-optimization-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            overflow: visible;
          }

          .maintenance-action-grid {
            background: transparent;
            border: 0;
          }

          .maintenance-action-card {
            min-height: auto;
            grid-template-rows: auto;
            row-gap: 12px;
            padding: 18px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            background: #f8fafc;
          }

          .maintenance-action-card + .maintenance-action-card {
            border-left: 1px solid #e5e7eb;
            border-top: 0;
          }

          .maintenance-optimization-item {
            min-height: auto;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            background: #f8fafc;
          }

          .maintenance-optimization-item:first-child {
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
          }

          .maintenance-optimization-item:nth-child(2) {
            padding-top: 16px;
            padding-left: 16px;
            border-top: 1px solid #e5e7eb;
            border-left: 1px solid #e5e7eb;
          }

          .maintenance-optimization-item:nth-child(3) {
            grid-column: 1 / -1;
          }

          .maintenance-optimization-item .min-h-16 {
            min-height: 0;
          }

          .maintenance-tool-button,
          .maintenance-user-card .mt-10,
          .maintenance-action-button {
            width: 100%;
            max-width: none;
            min-height: 44px;
            min-width: 0;
            white-space: normal;
          }

          .maintenance-meta-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }

          .maintenance-meta-value {
            text-align: left;
          }

          .maintenance-alert-row {
            padding: 14px 16px;
            font-size: 0.94rem;
            line-height: 1.45;
          }

          .maintenance-user-list {
            gap: 10px;
            padding-top: 18px;
            font-size: 0.95rem;
          }

          .maintenance-user-list-item {
            gap: 12px;
          }

          .maintenance-info-header {
            grid-template-columns: 44px minmax(0, 1fr);
            gap: 12px;
            padding: 14px;
          }

          .maintenance-info-header-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }

          .maintenance-info-list {
            gap: 14px;
          }

          .maintenance-info-row {
            grid-template-columns: 1fr;
            gap: 4px;
            border-radius: 12px;
            background: #f8fafc;
            padding: 12px;
          }

          .maintenance-info-value {
            text-align: left;
          }

          .maintenance-dialog {
            width: min(100% - 24px, 28rem);
            max-width: min(100% - 24px, 28rem) !important;
            padding: 18px;
            border-radius: 16px;
          }

          .maintenance-dialog [data-slot="alert-dialog-header"] {
            padding: 0;
          }

          .maintenance-dialog [data-slot="alert-dialog-footer"] {
            gap: 8px;
            padding: 0;
          }

          .maintenance-dialog [data-slot="alert-dialog-title"] {
            font-size: 1.1rem;
            line-height: 1.25;
          }

          .maintenance-dialog [data-slot="alert-dialog-description"] {
            font-size: 0.9rem;
            line-height: 1.45;
          }
        }

        @media (max-width: 420px) {
          .maintenance-page {
            padding: 12px;
          }

          .maintenance-action-grid,
          .maintenance-optimization-grid {
            grid-template-columns: 1fr;
          }

          .maintenance-action-card + .maintenance-action-card {
            border-left: 0;
            border-top: 1px solid #e5e7eb;
          }

          .maintenance-optimization-item:nth-child(2) {
            padding-top: 16px;
            padding-left: 0;
            border-top: 1px solid #e5e7eb;
            border-left: 0;
          }

          .maintenance-optimization-item:nth-child(3) {
            grid-column: auto;
          }

          .maintenance-page > .mb-8 > .relative {
            padding: 20px;
          }

          .maintenance-page > .mb-8 .flex.h-16 {
            width: 52px;
            height: 52px;
            border-radius: 14px;
          }

          .maintenance-page > .mb-8 .flex.h-16 svg {
            width: 28px;
            height: 28px;
          }

          .maintenance-page > .mb-8 h1 {
            font-size: 1.65rem;
          }

          .maintenance-card-content {
            padding: 16px;
          }

          .maintenance-action-card {
            padding: 16px;
          }

          .maintenance-section-heading {
            grid-template-columns: 1fr;
          }

          .maintenance-info-header {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <PageHeader
        title="System Maintenance"
        subtitle="Perform system upkeep tasks to keep the application secure, reliable, and up to date."
        icon={<Settings className="h-8 w-8" />}
      />

      <div className="maintenance-layout">
        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardContent className="maintenance-card-content">
            <SectionHeading
              icon={<Database className="h-6 w-6" />}
              tone="red"
              title="Database Backup & Restore"
              description="Create a backup copy of the system database or restore data from a previous backup."
            />

            <div className="maintenance-action-grid mt-7">
              <div className="maintenance-action-card">
                <IconTile tone="red" className="maintenance-action-icon">
                  <Download className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Create Backup</h3>
                <p className="maintenance-action-copy">
                  Create a backup of the current database and system records.
                </p>
                <div>
                  <div className="maintenance-meta-row">
                    <span className="maintenance-meta-label">Last Backup</span>
                    <span className="maintenance-meta-value">{lastBackup}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  className="maintenance-action-button bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600 disabled:text-white disabled:opacity-60"
                  onClick={handleBackup}
                  disabled={!isAdmin || isBackingUp}
                >
                  {isBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isBackingUp ? 'Creating Backup...' : 'Create Backup'}
                </Button>
              </div>

              <div className="maintenance-action-card">
                <IconTile tone="amber" className="maintenance-action-icon">
                  <Upload className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Restore Database</h3>
                <p className="maintenance-action-copy">
                  Restore the system using a previous backup file. This may overwrite current data.
                </p>
                <div>
                  <div className="maintenance-meta-row">
                    <span className="maintenance-meta-label">Last Restore</span>
                    <span className="maintenance-meta-value">Never restored</span>
                  </div>
                </div>
                <Button
                  type="button"
                  className="maintenance-action-button border-0 text-white hover:bg-amber-600 disabled:text-white"
                  style={{
                    backgroundColor: '#F59E0B',
                    color: '#FFFFFF',
                    opacity: !isAdmin || isRestoring ? 0.68 : 1,
                  }}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  disabled={!isAdmin || isRestoring}
                >
                  {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isRestoring ? 'Restoring...' : 'Restore Database'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql"
                  className="hidden"
                  onChange={handleRestore}
                />
              </div>
            </div>

            <div className="maintenance-alert-row mt-6 rounded-lg border border-blue-200 bg-blue-50 text-base text-slate-700">
              <Info className="mt-0.5 h-5 w-5 text-blue-600" />
              <p>Please create a backup before restoring to prevent data loss.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardContent className="maintenance-card-content maintenance-user-card">
            <SectionHeading
              icon={<Users className="h-6 w-6" />}
              tone="green"
              title="User Management"
              description="Manage user accounts, roles, and access permissions."
            />

            <div className="maintenance-user-list">
              {[
                'View and manage user accounts',
                'Approve or deactivate users',
                'Manage user roles and permissions',
                'Assign or change branch access',
              ].map(item => (
                <div className="maintenance-user-list-item" key={item}>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <Button
              type="button"
              className="mt-10 h-12 w-full max-w-[260px] justify-center rounded-lg bg-green-600 font-semibold text-white shadow-sm hover:bg-green-700"
              onClick={() => onNavigate('user-management')}
            >
              <Users className="h-4 w-4" />
              Manage Users
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardContent className="maintenance-card-content">
            <SectionHeading
              icon={<TrendingUp className="h-6 w-6" />}
              tone="blue"
              title="System Optimization"
              description="Optimize system performance and clean up unnecessary data to ensure smooth operation."
            />

            <div className="maintenance-optimization-grid mt-8">
              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <Trash2 className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Clear System Logs</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Remove old system logs that are no longer needed.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestPlaceholderAction('clearLogs')}
                  disabled={!isAdmin || Boolean(activePlaceholderAction)}
                >
                  {activePlaceholderAction === 'clearLogs' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activePlaceholderAction === 'clearLogs' ? maintenanceActionCopy.clearLogs.loadingLabel : maintenanceActionCopy.clearLogs.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <Server className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Optimize Database</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Optimize database tables for better performance.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestPlaceholderAction('optimize')}
                  disabled={!isAdmin || Boolean(activePlaceholderAction)}
                >
                  {activePlaceholderAction === 'optimize' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activePlaceholderAction === 'optimize' ? maintenanceActionCopy.optimize.loadingLabel : maintenanceActionCopy.optimize.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <PieChart className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Check Data Integrity</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Check for possible data integrity issues without changing records.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestPlaceholderAction('integrity')}
                  disabled={!isAdmin || Boolean(activePlaceholderAction)}
                >
                  {activePlaceholderAction === 'integrity' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activePlaceholderAction === 'integrity' ? maintenanceActionCopy.integrity.loadingLabel : maintenanceActionCopy.integrity.label}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardContent className="maintenance-card-content">
            <div className="maintenance-info-header">
              <div className="maintenance-info-header-icon">
                <Info className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">System Information</h2>
                <p className="mt-1.5 text-base leading-6 text-slate-600">View important system details.</p>
              </div>
            </div>

            <div className="maintenance-info-list mt-4">
              <InfoRow
                label="Database Status"
                value={databaseOnline ? 'Online' : summary.databaseStatus}
                valueClassName={databaseOnline ? 'text-green-600' : 'text-red-600'}
              />
              <InfoRow label="Application Version" value={appVersion} />
              <InfoRow label="Environment" value={appEnvironment} />
              <InfoRow label="Server Time" value={new Date().toLocaleString()} />
              <InfoRow label="Last Backup" value={lastBackup} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="maintenance-alert-row mt-6 rounded-lg border border-blue-100 bg-blue-50 text-base text-slate-700">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-600" />
        <span>Only authorized administrators can access this page.</span>
      </div>

      <AlertDialog open={showRestoreDialog} onOpenChange={(open) => {
        if (!open && !isRestoring) resetRestoreSelection();
        setShowRestoreDialog(open);
      }}>
        <AlertDialogContent className="maintenance-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>Restore database backup?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  Restoring <span className="font-semibold text-slate-900">{selectedRestoreFile?.name}</span> may overwrite current records. Create a fresh backup first if you have not already done so.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isRestoring} onClick={resetRestoreSelection}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmRestore}
              disabled={isRestoring}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isRestoring ? 'Restoring...' : 'Restore Database'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => {
        if (!open && !activePlaceholderAction) setPendingMaintenanceAction(null);
      }}>
        <AlertDialogContent className="maintenance-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Info className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>{pendingAction?.title}</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  {pendingAction?.description}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={Boolean(activePlaceholderAction)}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmPlaceholderAction}
              disabled={Boolean(activePlaceholderAction)}
              className={pendingAction?.toneClass || 'bg-blue-600 hover:bg-blue-700'}
            >
              {activePlaceholderAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {activePlaceholderAction ? pendingAction?.loadingLabel : 'Continue'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
