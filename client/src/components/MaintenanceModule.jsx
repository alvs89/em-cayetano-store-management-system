import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/api';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Info,
  Loader2,
  PieChart,
  RotateCcw,
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
import { Input } from './ui/input';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
import { useData } from './DataContext';
import { isAdminRole } from '../utils/roles';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const API_BASE = API_BASE_URL;
const MAX_RESTORE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const RESTORE_CONFIRMATION_TEXT = 'RESTORE';

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

const formatEnvironmentLabel = value => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Production';
  return normalized
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

const maintenanceActionCopy = {
  clearLogs: {
    title: 'Clear old system-wide logs?',
    label: 'Clear Logs',
    loadingLabel: 'Clearing...',
    toneClass: 'bg-red-600 hover:bg-red-700',
    endpoint: '/api/maintenance/clear-logs',
    description:
      'This removes only eligible non-critical system-wide logs after the configured retention period. Inventory records, sales records, user accounts, reports, archived records, backups, and security audit trails are kept safe.',
  },
  optimize: {
    title: 'Optimize application database tables?',
    label: 'Optimize',
    loadingLabel: 'Optimizing...',
    toneClass: 'bg-blue-600 hover:bg-blue-700',
    endpoint: '/api/maintenance/optimize',
    description:
      'This runs safe maintenance on application database tables by refreshing table statistics. It does not delete inventory, sales, user, report, archive, or backup records.',
  },
  integrity: {
    title: 'Check current branch data integrity?',
    label: 'Check Now',
    loadingLabel: 'Checking...',
    toneClass: 'bg-blue-600 hover:bg-blue-700',
    endpoint: '/api/maintenance/integrity-check',
    description:
      'This scans the signed-in branch for possible inventory, active/archive conflicts, stock movement, and user data issues. It is read-only and will not repair, delete, or overwrite records.',
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
  const fileInputRef = useRef();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingMaintenanceAction, setPendingMaintenanceAction] = useState(null);
  const [activeMaintenanceAction, setActiveMaintenanceAction] = useState(null);
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [summary, setSummary] = useState({
    activeUserCount: 0,
    pendingRegistrations: [],
    lastBackupAt: null,
    lastRestoreAt: null,
    databaseStatus: 'Checking...'
  });

  const isAdmin = isAdminRole(user?.role);
  const currentBranch = user?.branch || 'All branches';

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
        databaseStatus: 'Offline'
      }));
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const confirmBackup = async () => {
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
      window.dispatchEvent(new Event('maintenance-action-completed'));
    } catch (err) {
      const description = err.message && err.message !== 'Backup failed' ? err.message : undefined;
      toast.error('Backup failed', description ? { description } : undefined);
    } finally {
      setIsBackingUp(false);
      setShowBackupDialog(false);
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
    if (file.size > MAX_RESTORE_FILE_SIZE_BYTES) {
      toast.error('Restore failed', { description: 'Backup file must be 10 MB or smaller.' });
      setSelectedRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedRestoreFile(file);
    setShowRestoreDialog(true);
  };

  const resetRestoreSelection = () => {
    setSelectedRestoreFile(null);
    setRestoreConfirmation('');
    setShowRestoreDialog(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmRestore = async () => {
    if (!selectedRestoreFile || !isAdmin || isRestoring) return;
    if (restoreConfirmation.trim().toUpperCase() !== RESTORE_CONFIRMATION_TEXT) {
      toast.error('Restore confirmation required', {
        description: `Type ${RESTORE_CONFIRMATION_TEXT} to confirm this database restore.`,
      });
      return;
    }
    setIsRestoring(true);
    const restoreToastId = 'database-restore-progress';
    toast.loading('Database restore in progress...', {
      id: restoreToastId,
      description: 'Screens may briefly refresh while restored records reload.',
      classNames: {
        toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
      },
    });
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
      window.dispatchEvent(new Event('database-restored'));
      toast.success('Database restored successfully.', {
        id: restoreToastId,
        description: 'Records are being refreshed now. If a screen has not updated yet, wait a few seconds or refresh the page.',
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
      await loadSummary();
      window.dispatchEvent(new Event('maintenance-action-completed'));
    } catch (err) {
      toast.error('Restore failed', {
        id: restoreToastId,
        description: err.message,
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } finally {
      setIsRestoring(false);
      resetRestoreSelection();
    }
  };

  const requestMaintenanceAction = actionKey => {
    if (!isAdmin || activeMaintenanceAction) return;
    setPendingMaintenanceAction(actionKey);
  };

  const confirmMaintenanceAction = async () => {
    if (!pendingMaintenanceAction || activeMaintenanceAction) return;
    const action = maintenanceActionCopy[pendingMaintenanceAction];
    setActiveMaintenanceAction(pendingMaintenanceAction);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}${action.endpoint}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await getFetchErrorMessage(res, `${action.label} failed`));
      const data = await res.json();
      setMaintenanceResult({
        action: pendingMaintenanceAction,
        ...data,
      });

      if (pendingMaintenanceAction === 'clearLogs' && Number(data.clearedCount || 0) === 0) {
        toast.info(data.message || 'No eligible logs were found to clear.');
      } else {
        toast.success(data.message || `${action.label} completed successfully.`);
      }
      await loadSummary();
      window.dispatchEvent(new Event('maintenance-action-completed'));
    } catch (err) {
      toast.error(`${action.label} failed`, { description: err.message });
    } finally {
      setActiveMaintenanceAction(null);
      setPendingMaintenanceAction(null);
    }
  };

  const databaseOnline = summary.databaseStatus === 'Online';
  const lastBackup = compactDateTime(summary.lastBackupAt);
  const lastRestore = compactDateTime(summary.lastRestoreAt);
  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const appEnvironment = formatEnvironmentLabel(import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'Production');
  const pendingAction = pendingMaintenanceAction ? maintenanceActionCopy[pendingMaintenanceAction] : null;
  const displayedTime = compactDateTime(summary.serverTime || new Date().toISOString());

  return (
    <div className="maintenance-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .maintenance-page {
          overflow-x: hidden;
        }

        .maintenance-page,
        .maintenance-page * {
          box-sizing: border-box;
        }

        .maintenance-page > .mb-8,
        .maintenance-layout,
        .maintenance-page > .maintenance-alert-row {
          width: 100%;
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
          transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }

        .maintenance-action-button:not(:disabled):hover {
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
          transform: translateY(-1px);
        }

        .maintenance-restore-button {
          background-color: #f59e0b;
          color: #ffffff;
        }

        .maintenance-restore-button:not(:disabled):hover {
          background-color: #d97706;
          color: #ffffff;
        }

        .maintenance-restore-button:disabled {
          background-color: #f59e0b;
          color: #ffffff;
          opacity: 0.68;
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

        .maintenance-restore-file-name,
        .maintenance-restore-keyword {
          color: #dc2626;
          font-weight: 700;
        }

        .maintenance-restore-label {
          display: block;
          color: #0f172a;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.25;
        }

        .maintenance-restore-input {
          margin-top: 10px;
          height: 46px;
          width: 100%;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          font-size: 1rem;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .maintenance-restore-input:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.16);
        }

        .maintenance-restore-cancel,
        .maintenance-restore-submit {
          min-height: 42px;
          border-radius: 10px;
          font-weight: 700;
        }

        .maintenance-restore-cancel {
          border-color: #cbd5e1;
          background: #ffffff;
          color: #0f172a;
        }

        .maintenance-restore-cancel:hover {
          background: #f8fafc;
          color: #0f172a;
        }

        .maintenance-restore-submit {
          background: #dc2626;
          color: #ffffff;
          box-shadow: 0 8px 16px rgba(220, 38, 38, 0.14);
        }

        .maintenance-restore-submit:not(:disabled):hover {
          background: #b91c1c;
          color: #ffffff;
        }

        .maintenance-restore-submit:disabled {
          background: #dc2626;
          color: #ffffff;
          opacity: 0.6;
          box-shadow: none;
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

          .maintenance-confirm-dialog [data-slot="alert-dialog-header"] {
            align-items: center;
            text-align: center;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-header"] > .flex {
            display: block;
            width: 100%;
          }

          .maintenance-confirm-dialog .maintenance-dialog-icon {
            display: none;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-title"] {
            text-align: center;
            font-size: 1rem;
            line-height: 1.25;
            font-weight: 800;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-description"] {
            text-align: center;
            font-size: 0.88rem;
            line-height: 1.45;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-footer"] {
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
            margin-top: 18px;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-footer"] > button {
            width: 100%;
            min-height: 44px;
            justify-content: center;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-footer"] > button:last-child {
            order: 2;
          }

          .maintenance-confirm-dialog [data-slot="alert-dialog-footer"] > button:first-child {
            order: 1;
          }

          .maintenance-restore-label {
            font-size: 0.9rem;
            text-align: center;
          }

          .maintenance-restore-input {
            height: 44px;
            font-size: 1rem;
            text-align: left;
          }

          .maintenance-restore-cancel,
          .maintenance-restore-submit {
            min-width: 0;
            min-height: 42px;
            width: 100%;
            font-size: 0.95rem;
          }
        }

        @media (max-width: 420px) {
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
              description="Create or restore full-system database backups covering all branches and sales records."
            />

            <div className="maintenance-action-grid mt-7">
              <div className="maintenance-action-card">
                <IconTile tone="red" className="maintenance-action-icon">
                  <Download className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Create Backup</h3>
                <p className="maintenance-action-copy">
                  Create a full-system backup of the current database, including all branch and sales records.
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
                  onClick={() => setShowBackupDialog(true)}
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
                  Restore the full system using a previous backup file. This may overwrite records for all branches.
                </p>
                <div>
                  <div className="maintenance-meta-row">
                    <span className="maintenance-meta-label">Last Restore</span>
                    <span className="maintenance-meta-value">{lastRestore}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  className="maintenance-action-button maintenance-restore-button border-0"
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
              <div className="grid gap-1">
                <p>Please create a backup before restoring to prevent data loss.</p>
                <p>Backup and restore actions apply to the full database, including San Rafael, Manggahan, inventory, and sales records.</p>
              </div>
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
              onClick={() => isAdmin && onNavigate('user-management')}
              disabled={!isAdmin}
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
              description="Optimize application database table performance and clean up eligible non-critical system-wide logs."
            />

            <div className="maintenance-optimization-grid mt-8">
              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <Trash2 className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Clear System Logs</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Remove eligible non-critical system-wide logs after the configured retention period.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestMaintenanceAction('clearLogs')}
                  disabled={!isAdmin || Boolean(activeMaintenanceAction)}
                >
                  {activeMaintenanceAction === 'clearLogs' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeMaintenanceAction === 'clearLogs' ? maintenanceActionCopy.clearLogs.loadingLabel : maintenanceActionCopy.clearLogs.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <Server className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Optimize Database</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Refresh application table statistics for better performance.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestMaintenanceAction('optimize')}
                  disabled={!isAdmin || Boolean(activeMaintenanceAction)}
                >
                  {activeMaintenanceAction === 'optimize' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeMaintenanceAction === 'optimize' ? maintenanceActionCopy.optimize.loadingLabel : maintenanceActionCopy.optimize.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item flex flex-col items-start gap-3">
                <IconTile tone="blue" className="mb-3">
                  <PieChart className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Check Data Integrity</h3>
                <p className="mt-2 min-h-16 text-base leading-7 text-slate-600">Check signed-in branch data integrity issues without changing records.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button mt-auto"
                  onClick={() => requestMaintenanceAction('integrity')}
                  disabled={!isAdmin || Boolean(activeMaintenanceAction)}
                >
                  {activeMaintenanceAction === 'integrity' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeMaintenanceAction === 'integrity' ? maintenanceActionCopy.integrity.loadingLabel : maintenanceActionCopy.integrity.label}
                </Button>
              </div>
            </div>

            {!maintenanceResult && (
              <div className="maintenance-alert-row mt-6 rounded-lg border border-blue-100 bg-blue-50 text-base text-slate-700">
                <Info className="mt-0.5 h-5 w-5 text-blue-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">No maintenance action has been run yet.</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Choose an action above to clean eligible logs, optimize application database tables, or check the signed-in branch for data integrity issues.
                  </p>
                </div>
              </div>
            )}

            {maintenanceResult && (
              <div className="maintenance-alert-row mt-6 rounded-lg border border-slate-200 bg-slate-50 text-base text-slate-700">
                <Info className="mt-0.5 h-5 w-5 text-blue-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{maintenanceResult.message}</p>
                  {maintenanceResult.action === 'integrity' && Array.isArray(maintenanceResult.checks) && (
                    <div className="mt-2 grid gap-1 text-sm text-slate-600">
                      <span>Scope: Signed-in branch ({maintenanceResult.scopeBranch || currentBranch}).</span>
                      {maintenanceResult.checks
                        .filter(check => Number(check.count || 0) > 0)
                        .map(check => (
                          <span key={check.key}>
                            {check.count} {Number(check.count) === 1 ? 'issue' : 'issues'} found: {check.label}
                          </span>
                        ))}
                      {Number(maintenanceResult.issueCount || 0) === 0 && (
                        <span>All scanned records passed the current integrity checks.</span>
                      )}
                    </div>
                  )}
                  {maintenanceResult.action === 'optimize' && Array.isArray(maintenanceResult.analyzedTables) && (
                    <p className="mt-2 text-sm text-slate-600">
                      Application tables analyzed: {maintenanceResult.analyzedTables.join(', ')}.
                    </p>
                  )}
                  {maintenanceResult.action === 'clearLogs' && (
                    <p className="mt-2 text-sm text-slate-600">
                      Logs removed: {Number(maintenanceResult.clearedCount || 0)}.
                      {maintenanceResult.retentionDays ? ` System-wide retention rule: older than ${maintenanceResult.retentionDays} days.` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
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
                <p className="mt-1.5 text-base leading-6 text-slate-600">View important system details and maintenance scope.</p>
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
              <InfoRow label="Current Branch" value={currentBranch} />
              <InfoRow label="Backup/Restore Scope" value="Full system, all branches" />
              <InfoRow label="Integrity Check Scope" value={`Signed-in branch (${currentBranch})`} />
              <InfoRow label="System Time" value={displayedTime} />
              <InfoRow label="Last Backup" value={lastBackup} />
              <InfoRow label="Last Restore" value={lastRestore} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="maintenance-alert-row mt-6 rounded-lg border border-blue-100 bg-blue-50 text-base text-slate-700">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-600" />
        <span>Only authorized administrators can access this page.</span>
      </div>

      <AlertDialog open={showBackupDialog} onOpenChange={(open) => {
        if (!open && !isBackingUp) setShowBackupDialog(false);
      }}>
        <AlertDialogContent className="maintenance-dialog maintenance-confirm-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="maintenance-dialog-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Download className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>Create database backup?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  The system will generate and download a full-system backup of the current database records, including all branch inventory, sales records, users, reports, archive records, and logs. Keep this file secure because it may contain inventory, sales, and account information.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isBackingUp}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmBackup}
              disabled={isBackingUp}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isBackingUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isBackingUp ? 'Creating Backup...' : 'Create Backup'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRestoreDialog} onOpenChange={(open) => {
        if (!open && !isRestoring) resetRestoreSelection();
        setShowRestoreDialog(open);
      }}>
        <AlertDialogContent className="maintenance-dialog maintenance-confirm-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="maintenance-dialog-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>Restore database backup?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                Restoring <span className="maintenance-restore-file-name">{selectedRestoreFile?.name}</span> may overwrite the full system database, including all branch inventory and sales records. Create a fresh backup first if you have not already done so.
                </AlertDialogDescription>
                <div className="mt-4">
                  <label htmlFor="restore-confirmation" className="maintenance-restore-label">
                    Type <span className="maintenance-restore-keyword">{RESTORE_CONFIRMATION_TEXT}</span> to continue
                  </label>
                  <Input
                    id="restore-confirmation"
                    value={restoreConfirmation}
                    onChange={(event) => setRestoreConfirmation(event.target.value)}
                    disabled={isRestoring}
                    className="maintenance-restore-input"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel
              disabled={isRestoring}
              onClick={resetRestoreSelection}
              className="maintenance-restore-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmRestore}
              disabled={isRestoring || restoreConfirmation.trim().toUpperCase() !== RESTORE_CONFIRMATION_TEXT}
              className="maintenance-restore-submit"
            >
              {isRestoring ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RotateCcw className="mr-2 h-5 w-5" />}
              {isRestoring ? 'Restoring...' : 'Restore Database'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => {
        if (!open && !activeMaintenanceAction) setPendingMaintenanceAction(null);
      }}>
        <AlertDialogContent className="maintenance-dialog maintenance-confirm-dialog max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          <AlertDialogHeader showBrand={false}>
            <div className="flex items-start gap-4">
              <div className="maintenance-dialog-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
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
            <AlertDialogCancel disabled={Boolean(activeMaintenanceAction)}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={confirmMaintenanceAction}
              disabled={Boolean(activeMaintenanceAction)}
              className={pendingAction?.toneClass || 'bg-blue-600 hover:bg-blue-700'}
            >
              {activeMaintenanceAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {activeMaintenanceAction ? pendingAction?.loadingLabel : 'Continue'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
