// Maintenance module: supports administrative system operations such as backup,
// restore, log cleanup, and maintenance-related audit visibility.
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/api';
import {
  AlertTriangle,
  ChevronDown,
  Database,
  Download,
  FileDown,
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
  X,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
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

const SELECTIVE_EXPORT_DATASETS = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'archive', label: 'Archive' },
  { value: 'audit', label: 'Audit Trail' },
];

const EXPORT_BRANCH_OPTIONS = [
  { value: 'all', label: 'All Branches' },
  { value: 'San Rafael', label: 'San Rafael' },
  { value: 'Manggahan', label: 'Manggahan' },
];

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
    title: 'Check system data relationships?',
    label: 'Check Now',
    loadingLabel: 'Checking...',
    toneClass: 'bg-blue-600 hover:bg-blue-700',
    endpoint: '/api/maintenance/integrity-check',
    description:
      'This read-only check scans the signed-in branch for inventory, purchase, POS sales, manual item, stock movement, archive, user, audit log, backup log, and system log consistency issues. It will not repair, delete, or overwrite records.',
  },
};

const getFetchErrorMessage = async (res, fallback) => {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const primaryMessage = data?.error || data?.message || fallback;
      const details = data?.details || data?.detail;

      if (details && String(details).trim() && String(details).trim() !== primaryMessage) {
        return String(details).trim();
      }

      return primaryMessage;
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
        <p className="mt-1.5 max-w-xl text-base leading-6 text-slate-700">{description}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueClassName = '', full = false }) {
  return (
    <div className={`maintenance-info-row text-sm ${full ? 'maintenance-info-row-full' : ''}`}>
      <span className="maintenance-info-label text-slate-600">{label}</span>
      <span className={`maintenance-info-value text-right font-medium text-slate-950 ${valueClassName}`}>{value}</span>
    </div>
  );
}

export function MaintenanceModule({ user }) {
  const fileInputRef = useRef();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDataset, setExportDataset] = useState('inventory');
  const [exportBranch, setExportBranch] = useState(() => user?.branch || 'all');
  const [exportColumns, setExportColumns] = useState('essential');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
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
  const signedInBranch = user?.branch || '';
  const currentBranch = signedInBranch || 'All branches';
  const exportUsesBranch = exportDataset !== 'audit';
  const hasExportDateError = Boolean(exportDateFrom && exportDateTo && exportDateFrom > exportDateTo);
  const exportDisabled = !isAdmin || isExporting || hasExportDateError;
  const exportDateScopeText = exportDateFrom || exportDateTo
    ? `Date range: ${exportDateFrom || 'earliest record'} to ${exportDateTo || 'latest record'}.`
    : 'Date range: all available dates.';
  const exportBranchOptions = React.useMemo(() => {
    const options = [...EXPORT_BRANCH_OPTIONS];
    if (signedInBranch && !options.some(option => option.value === signedInBranch)) {
      options.push({ value: signedInBranch, label: signedInBranch });
    }
    return options;
  }, [signedInBranch]);

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

  useEffect(() => {
    if (!signedInBranch) return;
    setExportBranch(branch => branch && branch !== 'current' ? branch : signedInBranch);
  }, [signedInBranch]);

  const resetSelectiveExport = () => {
    setExportDataset('inventory');
    setExportBranch(signedInBranch || 'all');
    setExportColumns('essential');
    setExportDateFrom('');
    setExportDateTo('');
  };

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
      const description = err.message && err.message !== 'Restore failed'
        ? err.message
        : 'The backup could not be restored. Please verify that the selected file is a valid backup from this system and try again.';
      toast.error('Restore failed', {
        id: restoreToastId,
        description,
        classNames: {
          toast: 'rounded-2xl border border-gray-200 shadow-2xl bg-white/95 text-gray-900',
        },
      });
    } finally {
      setIsRestoring(false);
      resetRestoreSelection();
    }
  };

  const downloadSelectiveExport = async () => {
    if (exportDisabled) {
      if (hasExportDateError) {
        toast.error('Export failed', { description: 'Start date cannot be later than end date.' });
      }
      return;
    }

    setIsExporting(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        dataset: exportDataset,
        branch: exportUsesBranch ? exportBranch : 'all',
        columns: exportColumns,
      });
      if (exportDateFrom) params.set('dateFrom', exportDateFrom);
      if (exportDateTo) params.set('dateTo', exportDateTo);

      const res = await fetch(`${API_BASE}/api/maintenance/selective-export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await getFetchErrorMessage(res, 'Export failed'));

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `emcayetano-${exportDataset}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Selective data export downloaded.', {
        description: 'This CSV is for reporting and review. It is not a restore-capable database backup.',
      });
      window.dispatchEvent(new Event('maintenance-action-completed'));
    } catch (err) {
      toast.error('Export failed', {
        description: err.message && err.message !== 'Export failed'
          ? err.message
          : 'The selected data could not be exported. Please review the filters and try again.',
      });
    } finally {
      setIsExporting(false);
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
          grid-template-columns: minmax(0, 1.62fr) minmax(360px, 0.9fr);
          gap: 22px;
          align-items: start;
        }

        .maintenance-wide-card {
          grid-column: 1 / -1;
        }

        .maintenance-sidebar {
          display: grid;
          gap: 16px;
          align-content: start;
          min-width: 0;
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

        .maintenance-section-heading h2 {
          font-size: 1.08rem;
          line-height: 1.25;
        }

        .maintenance-section-heading p {
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .maintenance-section-heading h2,
        .maintenance-section-heading p,
        .maintenance-action-copy,
        .maintenance-meta-value,
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
          min-height: 252px;
          display: grid;
          grid-template-rows: 48px auto minmax(82px, 1fr) auto auto;
          row-gap: 14px;
          padding: 24px;
          background: transparent;
        }

        .maintenance-action-icon {
          margin: 0;
          align-self: start;
        }

        .maintenance-action-copy {
          margin: 0;
          color: #475569;
          font-size: 14px;
          line-height: 1.55;
          max-width: 36ch;
        }

        .maintenance-action-card h3,
        .maintenance-optimization-title h3 {
          font-size: 0.95rem;
          line-height: 1.3;
        }

        .maintenance-action-card + .maintenance-action-card {
          border-left: 1px solid #e5e7eb;
        }

        .maintenance-export-panel {
          border: 1px solid #d7e0ea;
          border-radius: 14px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
          min-height: 540px;
          display: flex;
          flex-direction: column;
        }

        .maintenance-export-panel .maintenance-section-heading {
          grid-template-columns: 44px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }

        .maintenance-export-panel .maintenance-section-heading .h-14 {
          width: 44px;
          height: 44px;
          border-radius: 13px;
        }

        .maintenance-export-panel .maintenance-section-heading h2 {
          color: #0f172a;
          font-size: 1.18rem;
          line-height: 1.2;
          letter-spacing: 0;
        }

        .maintenance-export-panel .maintenance-section-heading p {
          max-width: 44rem;
          color: #475569;
          font-size: 0.88rem;
          line-height: 1.4;
        }

        .maintenance-export-body {
          flex: 1;
          padding: 24px 22px;
        }

        .maintenance-export-notice {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: min(100%, 500px);
          margin-top: 18px;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          background: #f8fbff;
          color: #0f2a54;
          font-size: 0.86rem;
          font-weight: 600;
          line-height: 1.35;
          padding: 9px 12px;
        }

        .maintenance-export-notice svg {
          flex: 0 0 auto;
          color: #2563eb;
        }

        .maintenance-export-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(180px, 1fr));
          column-gap: 14px;
          row-gap: 14px;
          margin-top: 24px;
        }

        .maintenance-export-field {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .maintenance-export-field label {
          color: #475569;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .maintenance-export-control {
          position: relative;
          display: block;
        }

        .maintenance-export-control-chevron {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          z-index: 1;
        }

        .maintenance-export-control-chevron {
          right: 14px;
          color: #64748b;
        }

        .maintenance-export-field select,
        .maintenance-export-field input {
          height: 44px;
          min-height: 0;
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 0.86rem;
          line-height: 1.5;
          padding: 0 38px 0 14px;
        }

        .maintenance-export-field select {
          appearance: none;
          padding-top: 1px;
          padding-bottom: 3px;
        }

        .maintenance-export-field input[type="date"] {
          color: #64748b;
          padding: 0 14px;
        }

        .maintenance-export-review {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          margin-top: 26px;
          border: 1px solid #bfdbfe;
          border-left: 4px solid #2563eb;
          border-radius: 12px;
          background: #f8fbff;
          color: #334155;
          padding: 12px 14px;
        }

        .maintenance-export-review-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #2563eb;
          color: #ffffff;
        }

        .maintenance-export-review h3 {
          margin: 0;
          color: #1e3a5f;
          font-size: 0.84rem;
          font-weight: 800;
          line-height: 1.25;
        }

        .maintenance-export-review p {
          margin: 6px 0 0;
          color: #475569;
          font-size: 0.84rem;
          line-height: 1.45;
        }

        .maintenance-export-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 16px 20px;
          margin-top: 0;
        }

        .maintenance-export-auth-note {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: #475569;
          font-size: 0.86rem;
          font-weight: 600;
          line-height: 1.35;
          flex: 1 1 280px;
        }

        .maintenance-export-button-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex: 0 0 auto;
        }

        .maintenance-export-cancel {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          min-width: 108px;
          padding: 0 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          font-weight: 800;
          box-shadow: none;
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            box-shadow 150ms ease,
            color 150ms ease;
        }

        .maintenance-export-cancel:not(:disabled):hover {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1d4ed8;
          box-shadow: 0 10px 18px rgba(37, 99, 235, 0.12);
        }

        .maintenance-export-cancel:not(:disabled):focus-visible {
          border-color: #2563eb;
          outline: none;
          box-shadow:
            0 0 0 3px rgba(37, 99, 235, 0.18),
            0 10px 18px rgba(37, 99, 235, 0.12);
        }

        .maintenance-export-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          min-height: 0;
          min-width: 140px;
          padding: 0 16px;
          border-radius: 10px;
          background: #1d4ed8;
          color: #ffffff;
          font-weight: 800;
          box-shadow: 0 10px 18px rgba(29, 78, 216, 0.16);
          transition:
            background-color 150ms ease,
            box-shadow 150ms ease;
        }

        .maintenance-export-button:not(:disabled):hover {
          background: #1e40af;
          color: #ffffff;
          box-shadow: 0 14px 24px rgba(29, 78, 216, 0.24);
        }

        .maintenance-export-button:not(:disabled):focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px rgba(37, 99, 235, 0.2),
            0 14px 24px rgba(29, 78, 216, 0.24);
        }

        .maintenance-export-button:disabled {
          background: #94a3b8;
          color: #ffffff;
          opacity: 1;
          box-shadow: none;
        }

        .maintenance-meta-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: baseline;
          gap: 18px;
          font-size: 13px;
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
          height: 44px;
          width: 100%;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
          box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
          transition: background-color 160ms ease, box-shadow 160ms ease;
        }

        .maintenance-action-button:not(:disabled):hover {
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
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
          gap: 16px;
          align-items: stretch;
        }

        .maintenance-optimization-item {
          min-width: 0;
          min-height: 228px;
          display: grid;
          grid-template-rows: auto minmax(84px, 1fr) 48px;
          align-items: start;
          gap: 14px;
          padding: 18px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #f8fafc;
        }

        .maintenance-optimization-title {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          min-width: 0;
        }

        .maintenance-optimization-title .maintenance-title-icon {
          display: inline-flex;
          height: 42px;
          width: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #eff6ff;
          color: #2563eb;
        }

        .maintenance-optimization-title h3 {
          margin: 0;
          min-width: 0;
          line-height: 1.25;
        }

        .maintenance-optimization-item p {
          margin-top: 0;
          margin-bottom: 0;
          max-width: 38ch;
          line-height: 1.55;
        }

        .maintenance-optimization-item .maintenance-tool-button {
          align-self: end;
          justify-self: center;
          width: 148px;
        }

        .maintenance-optimization-item:first-child {
          padding-left: 18px;
          border-left: 1px solid #e5e7eb;
        }

        .maintenance-optimization-item:last-child {
          padding-right: 18px;
        }

        .maintenance-info-list {
          display: grid;
          gap: 0;
          padding-top: 16px;
          border-top: 1px solid #eef2f7;
        }

        .maintenance-info-row {
          display: grid;
          grid-template-columns: minmax(150px, 0.88fr) minmax(0, 1.12fr);
          align-items: start;
          gap: 18px;
          min-width: 0;
          padding: 12px 0;
          border-bottom: 1px solid #eef2f7;
        }

        .maintenance-info-row:last-child {
          border-bottom: 0;
        }

        .maintenance-info-row-full {
          grid-column: 1 / -1;
        }

        .maintenance-info-row-full .maintenance-info-value {
          text-align: right;
          max-width: none;
        }

        .maintenance-info-label {
          min-width: 0;
          font-size: 0.88rem;
          font-weight: 600;
          line-height: 1.45;
          color: #475569;
        }

        .maintenance-info-value {
          min-width: 0;
          text-align: right;
          line-height: 1.45;
          overflow-wrap: anywhere;
          word-break: normal;
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

        .maintenance-sidebar .maintenance-card-content {
          padding: 20px;
        }

        .maintenance-sidebar .maintenance-info-header,
        .maintenance-sidebar .maintenance-section-heading {
          grid-template-columns: 40px minmax(0, 1fr);
          gap: 12px;
        }

        .maintenance-sidebar .maintenance-info-header {
          align-items: center;
          padding: 12px;
        }

        .maintenance-sidebar .maintenance-info-header-icon,
        .maintenance-sidebar .maintenance-section-heading .h-14 {
          width: 40px;
          height: 40px;
          border-radius: 12px;
        }

        .maintenance-sidebar .maintenance-info-header h2,
        .maintenance-sidebar .maintenance-section-heading h2 {
          font-size: 1rem;
          line-height: 1.25;
        }

        .maintenance-sidebar .maintenance-info-header p,
        .maintenance-sidebar .maintenance-section-heading p {
          margin-top: 4px;
          font-size: 0.85rem;
          line-height: 1.35;
        }

        .maintenance-sidebar .maintenance-info-list {
          margin-top: 14px;
          padding-top: 10px;
        }

        .maintenance-sidebar .maintenance-info-row {
          min-height: 38px;
          grid-template-columns: minmax(122px, 0.86fr) minmax(0, 1.14fr);
          gap: 12px;
          padding: 9px 0;
          font-size: 13px;
        }

        .maintenance-sidebar .maintenance-info-label,
        .maintenance-sidebar .maintenance-info-value {
          font-size: 13px;
          line-height: 1.35;
        }

        .maintenance-sidebar .maintenance-optimization-grid {
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 14px;
        }

        .maintenance-sidebar .maintenance-optimization-item {
          min-height: 0;
          grid-template-columns: minmax(0, 1fr) 140px;
          grid-template-rows: auto auto;
          gap: 8px 12px;
          padding: 14px;
          border-radius: 12px;
          align-items: center;
        }

        .maintenance-sidebar .maintenance-optimization-title {
          grid-column: 1;
          grid-row: 1;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 10px;
        }

        .maintenance-sidebar .maintenance-optimization-title .maintenance-title-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
        }

        .maintenance-sidebar .maintenance-optimization-title h3 {
          font-size: 0.93rem;
        }

        .maintenance-sidebar .maintenance-optimization-item p {
          grid-column: 1;
          grid-row: 2;
          max-width: none;
          font-size: 0.84rem;
          line-height: 1.4;
        }

        .maintenance-sidebar .maintenance-optimization-item .maintenance-tool-button {
          grid-column: 2;
          grid-row: 1 / span 2;
          width: 100%;
          min-width: 0;
          height: 36px;
          align-self: center;
          justify-self: center;
          font-size: 0.82rem;
          padding: 0 12px;
        }

        .maintenance-sidebar .maintenance-alert-row {
          margin-top: 12px;
          padding: 12px 14px;
          font-size: 0.85rem;
        }

        .maintenance-tool-button {
          height: 44px;
          min-width: 132px;
          max-width: 100%;
          border-radius: 10px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.88rem;
          font-weight: 700;
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.08);
        }

        .maintenance-tool-button:hover {
          border-color: #93c5fd;
          background: #dbeafe;
          color: #1e40af;
        }

        .maintenance-alert-row {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          padding: 18px 22px;
          font-size: 0.94rem;
          line-height: 1.5;
        }

        .maintenance-alert-row p,
        .maintenance-alert-row span {
          font-size: inherit;
          line-height: inherit;
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

          .maintenance-sidebar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
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

          .maintenance-sidebar {
            grid-template-columns: 1fr;
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

          .maintenance-export-panel {
            padding: 0;
            min-height: auto;
          }

          .maintenance-export-panel .maintenance-section-heading {
            grid-template-columns: 46px minmax(0, 1fr);
            gap: 14px;
          }

          .maintenance-export-panel .maintenance-section-heading .h-14 {
            width: 46px;
            height: 46px;
            border-radius: 13px;
          }

          .maintenance-export-panel .maintenance-section-heading h2 {
            font-size: 1.12rem;
          }

          .maintenance-export-panel .maintenance-section-heading p {
            font-size: 0.86rem;
            line-height: 1.4;
          }

          .maintenance-export-body {
            padding: 18px;
          }

          .maintenance-export-notice {
            width: 100%;
            font-size: 0.88rem;
          }

          .maintenance-action-grid,
          .maintenance-optimization-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            overflow: visible;
          }

          .maintenance-export-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
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

          .maintenance-export-actions {
            align-items: center;
            flex-direction: row;
            padding: 16px 18px;
          }

          .maintenance-export-button {
            width: auto;
          }

          .maintenance-optimization-item {
            min-height: auto;
            grid-template-rows: auto minmax(76px, 1fr) 48px;
            gap: 12px;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            background: #f8fafc;
          }

          .maintenance-optimization-title {
            grid-template-columns: 38px minmax(0, 1fr);
            gap: 10px;
          }

          .maintenance-optimization-title .maintenance-title-icon {
            height: 38px;
            width: 38px;
            border-radius: 11px;
          }

          .maintenance-optimization-item p {
            margin-top: 0;
            max-width: none;
          }

          .maintenance-optimization-item .maintenance-tool-button {
            width: 100%;
            justify-self: stretch;
          }

          .maintenance-optimization-item:first-child {
            padding-top: 16px;
            padding-left: 16px;
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
            grid-template-columns: minmax(112px, 0.86fr) minmax(0, 1.14fr);
            gap: 12px;
            padding: 11px 0;
          }

          .maintenance-info-row-full {
            grid-template-columns: minmax(112px, 0.86fr) minmax(0, 1.14fr);
          }

          .maintenance-info-value {
            text-align: right;
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

          .maintenance-info-list {
            grid-template-columns: 1fr;
          }

          .maintenance-info-row,
          .maintenance-info-row-full {
            grid-template-columns: minmax(96px, 0.78fr) minmax(0, 1.22fr);
            gap: 10px;
          }

          .maintenance-action-card + .maintenance-action-card {
            border-left: 0;
            border-top: 1px solid #e5e7eb;
          }

          .maintenance-optimization-item:nth-child(2) {
            padding-top: 16px;
            padding-left: 16px;
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

          .maintenance-export-panel {
            padding: 0;
          }

          .maintenance-export-body {
            padding: 18px;
          }

          .maintenance-export-panel .maintenance-section-heading {
            grid-template-columns: 1fr;
          }

          .maintenance-export-grid {
            grid-template-columns: 1fr;
          }

          .maintenance-export-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .maintenance-export-auth-note {
            width: 100%;
          }

          .maintenance-export-button-group {
            width: 100%;
            flex-direction: column;
          }

          .maintenance-export-button {
            width: 100%;
          }

          .maintenance-export-cancel {
            width: 100%;
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
              description="Create or restore full-system database backups covering all branches, inventory, POS sales, purchases, users, and logs."
            />

            <div className="maintenance-action-grid mt-9">
              <div className="maintenance-action-card">
                <IconTile tone="red" className="maintenance-action-icon">
                  <Download className="h-6 w-6" />
                </IconTile>
                <h3 className="text-base font-bold text-slate-950">Create Backup</h3>
                <p className="maintenance-action-copy">
                  Create a full-system backup of the current database, including inventory, sales, purchases, users, archive records, and logs.
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
                  Restore the full system using a previous backup file. This may overwrite current inventory, sales, purchase, user, archive, and log records.
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
                <p>Backup and restore actions apply to the full database, including San Rafael, Manggahan, inventory, sales, purchases, users, archive records, and logs.</p>
              </div>
            </div>

            <div className="maintenance-export-panel mt-6">
              <div className="maintenance-export-body">
                <SectionHeading
                  icon={<FileDown className="h-6 w-6" />}
                  tone="blue"
                  title="Selective Data Export"
                  description="Export filtered business records for review, reporting, and evaluation."
                />

                <div className="maintenance-export-notice">
                  <Info className="h-5 w-5" />
                  <span>This CSV is not a restore-capable database backup.</span>
                </div>

                <div className="maintenance-export-grid">
                  <div className="maintenance-export-field">
                    <label htmlFor="selective-export-dataset">Dataset</label>
                    <div className="maintenance-export-control">
                      <select
                        id="selective-export-dataset"
                        value={exportDataset}
                        onChange={event => setExportDataset(event.target.value)}
                        disabled={!isAdmin || isExporting}
                      >
                        {SELECTIVE_EXPORT_DATASETS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="maintenance-export-control-chevron h-4 w-4" />
                    </div>
                  </div>

                  {exportUsesBranch && (
                    <div className="maintenance-export-field">
                      <label htmlFor="selective-export-branch">Branch Scope</label>
                      <div className="maintenance-export-control">
                        <select
                          id="selective-export-branch"
                          value={exportBranch}
                          onChange={event => setExportBranch(event.target.value)}
                          disabled={!isAdmin || isExporting}
                        >
                          {exportBranchOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="maintenance-export-control-chevron h-4 w-4" />
                      </div>
                    </div>
                  )}

                  <div className="maintenance-export-field">
                    <label htmlFor="selective-export-columns">Column Set</label>
                    <div className="maintenance-export-control">
                      <select
                        id="selective-export-columns"
                        value={exportColumns}
                        onChange={event => setExportColumns(event.target.value)}
                        disabled={!isAdmin || isExporting}
                      >
                        <option value="essential">Essential Columns</option>
                        <option value="detailed">Detailed Columns</option>
                      </select>
                      <ChevronDown className="maintenance-export-control-chevron h-4 w-4" />
                    </div>
                  </div>

                  <div className="maintenance-export-field">
                    <label htmlFor="selective-export-date-from">Start Date</label>
                    <div className="maintenance-export-control">
                      <input
                        id="selective-export-date-from"
                        type="date"
                        value={exportDateFrom}
                        onChange={event => setExportDateFrom(event.target.value)}
                        disabled={!isAdmin || isExporting}
                      />
                    </div>
                  </div>

                  <div className="maintenance-export-field">
                    <label htmlFor="selective-export-date-to">End Date</label>
                    <div className="maintenance-export-control">
                      <input
                        id="selective-export-date-to"
                        type="date"
                        value={exportDateTo}
                        onChange={event => setExportDateTo(event.target.value)}
                        disabled={!isAdmin || isExporting}
                      />
                    </div>
                  </div>
                </div>

                <div className="maintenance-export-review">
                  <div className="maintenance-export-review-icon">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3>Review Export</h3>
                    <p>
                      {exportUsesBranch
                        ? `Exporting ${exportBranch === 'all' ? 'all branches' : exportBranch} records for review only.`
                        : 'Audit Trail export covers system-level activity records.'}
                      {' '}{exportDateScopeText} Use full database backup for disaster recovery.
                    </p>
                    {hasExportDateError && (
                      <p className="font-semibold text-red-700">Start date cannot be later than end date.</p>
                    )}
                    {!isAdmin && (
                      <p className="font-semibold text-slate-800">Only Admin / Owner accounts can export selected data.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="maintenance-export-actions">
                <div className="maintenance-export-auth-note">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <span>Only authorized administrators can access this page.</span>
                </div>
                <div className="maintenance-export-button-group">
                  <Button
                    type="button"
                    variant="outline"
                    className="maintenance-export-cancel"
                    onClick={resetSelectiveExport}
                    disabled={isExporting}
                    title="Clear export filters"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                  <Button
                    type="button"
                    className="maintenance-export-button"
                    onClick={downloadSelectiveExport}
                    disabled={exportDisabled}
                    title={!isAdmin ? 'Only Admin / Owner accounts can export selected data.' : hasExportDateError ? 'Fix the date range before exporting.' : 'Download selected records as CSV'}
                  >
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="maintenance-sidebar">
          <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
            <CardContent className="maintenance-card-content">
              <div className="maintenance-info-header">
                <div className="maintenance-info-header-icon">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-950">System Information</h2>
                  <p className="text-slate-600">View important system details and maintenance scope.</p>
                </div>
              </div>

              <div className="maintenance-info-list">
                <InfoRow
                  label="Database Status"
                  value={databaseOnline ? 'Online' : summary.databaseStatus}
                  valueClassName={databaseOnline ? 'text-green-600' : 'text-red-600'}
                />
                <InfoRow label="Application Version" value={appVersion} />
                <InfoRow label="Environment" value={appEnvironment} />
                <InfoRow label="Current Branch" value={currentBranch} />
                <InfoRow label="Backup/Restore Scope" value="Full system, all branches" full />
                <InfoRow label="Integrity Check Scope" value={`Signed-in branch (${currentBranch}) plus shared user/log links`} full />
                <InfoRow label="System Time" value={displayedTime} />
                <InfoRow label="Last Backup" value={lastBackup} />
                <InfoRow label="Last Restore" value={lastRestore} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
            <CardContent className="maintenance-card-content">
              <SectionHeading
                icon={<TrendingUp className="h-5 w-5" />}
                tone="blue"
                title="System Optimization"
                description="Run routine upkeep without leaving this page."
              />

              <div className="maintenance-optimization-grid">
              <div className="maintenance-optimization-item">
                <div className="maintenance-optimization-title">
                  <span className="maintenance-title-icon">
                    <Trash2 className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold text-slate-950">Clear System Logs</h3>
                </div>
                <p className="text-base text-slate-600">Remove eligible non-critical system-wide logs after the configured retention period.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button"
                  onClick={() => requestMaintenanceAction('clearLogs')}
                  disabled={!isAdmin || Boolean(activeMaintenanceAction)}
                >
                  {activeMaintenanceAction === 'clearLogs' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeMaintenanceAction === 'clearLogs' ? maintenanceActionCopy.clearLogs.loadingLabel : maintenanceActionCopy.clearLogs.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item">
                <div className="maintenance-optimization-title">
                  <span className="maintenance-title-icon">
                    <Server className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold text-slate-950">Optimize Database</h3>
                </div>
                <p className="text-base text-slate-600">Refresh application table statistics for better performance.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button"
                  onClick={() => requestMaintenanceAction('optimize')}
                  disabled={!isAdmin || Boolean(activeMaintenanceAction)}
                >
                  {activeMaintenanceAction === 'optimize' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeMaintenanceAction === 'optimize' ? maintenanceActionCopy.optimize.loadingLabel : maintenanceActionCopy.optimize.label}
                </Button>
              </div>

              <div className="maintenance-optimization-item">
                <div className="maintenance-optimization-title">
                  <span className="maintenance-title-icon">
                    <PieChart className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold text-slate-950">Check Data Integrity</h3>
                </div>
                <p className="text-base text-slate-600">Check inventory, purchase, sales, manual item, user, and log relationships without changing records.</p>
                <Button
                  type="button"
                  className="maintenance-tool-button"
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
        </div>

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
                  The system will generate and download a full-system backup of the current database records, including all branch inventory, POS sales, manual sales items, purchase entries, users, archive records, audit logs, backup logs, and system logs. Keep this file secure because it may contain inventory, sales, supplier, and account information.
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
                Restoring <span className="maintenance-restore-file-name">{selectedRestoreFile?.name}</span> may overwrite the full system database, including inventory, POS sales, purchase entries, users, archive records, audit logs, backup logs, and system logs for all branches. Create a fresh backup first if you have not already done so.
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
              {activeMaintenanceAction ? pendingAction?.loadingLabel : pendingAction?.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
