// Audit Trail module: displays traceable user and system activity for
// accountability across inventory, sales, purchases, and maintenance actions.
import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CalendarDays, Clock, Database, Eye, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { getStockMovementReasonLabel } from '../utils/stockMovementReasons';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { HeaderTimeBadge } from './PageHeader';

const ACTION_GROUPS = {
  all: 'All Actions',
  security: 'Security / Login',
  inventory: 'Inventory',
  archive: 'Archive',
  users: 'User Accounts',
  maintenance: 'Maintenance',
  alerts: 'Alerts',
  reports: 'Reports'
};

const DATE_RANGES = {
  all: 'All Time',
  today: 'Today',
  sevenDays: 'Last 7 Days',
  thirtyDays: 'Last 30 Days',
  custom: 'Custom Date Range'
};

const DEFAULT_VISIBLE_RECORDS = 5;

const getActionGroup = action => {
  const normalized = String(action || '').toUpperCase();
  if (normalized.startsWith('AUTH_') || normalized.includes('LOGIN') || normalized.includes('OTP') || normalized.includes('SESSION')) return 'security';
  if (normalized.includes('STOCK') || normalized.includes('ITEM') || normalized.includes('DUPLICATE')) return 'inventory';
  if (normalized.includes('ARCHIVE') || normalized.includes('RESTORE_ITEM')) return 'archive';
  if (normalized.includes('USER') || normalized.includes('ROLE') || normalized.includes('BRANCH') || normalized.includes('APPROVE') || normalized.includes('DEACTIVATE')) return 'users';
  if (normalized.includes('BACKUP') || normalized.includes('DATABASE') || normalized.includes('LOGS') || normalized.includes('OPTIMIZE') || normalized.includes('INTEGRITY')) return 'maintenance';
  if (normalized.includes('ALERT')) return 'alerts';
  if (normalized.includes('REPORT')) return 'reports';
  return 'inventory';
};

const getActionBadgeClass = group => {
  if (group === 'security') return 'border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100';
  if (group === 'maintenance') return 'border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-100';
  if (group === 'users') return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
  if (group === 'archive') return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
  if (group === 'alerts') return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
  if (group === 'reports') return 'bg-green-100 text-green-700 hover:bg-green-100';
  return 'bg-red-100 text-red-700 hover:bg-red-100';
};

const formatActionLabel = action => {
  const value = String(action || 'UNKNOWN_ACTION');
  const [base, detail] = value.split(':').map(part => part.trim());
  const label = base
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return detail ? `${label}: ${detail}` : label;
};

const formatFieldLabel = value => {
  const normalized = String(value || '').replace(/[_\s-]/g, '').toLowerCase();
  if (normalized === 'ip') return 'IP Address';
  if (normalized === 'useragent') return 'Device';
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatTargetType = value => {
  const label = formatFieldLabel(value);
  return label || 'System Record';
};

const normalizeDetails = details => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return details;
};

const formatCustomerType = value => {
  const customerTypes = {
    walk_in: 'Walk-in Customer',
    sister_company: 'Sister Company',
    hardware_reseller: 'Other Hardware / Reseller',
    regular: 'Regular Customer',
    contractor: 'Contractor'
  };
  return customerTypes[String(value || '').toLowerCase()] || formatFieldLabel(value) || 'None';
};

const isMovementReasonField = key => String(key || '').replace(/[_\s-]/g, '').toLowerCase() === 'movementreason';

const formatIpAddress = value => {
  const ip = String(value || '').trim();
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip || 'None';
};

const formatUserAgent = value => {
  const text = String(value || '').trim();
  if (!text) return 'Unknown device';

  const browser = text.includes('Edg/') ? 'Microsoft Edge'
    : text.includes('OPR/') || text.includes('Opera') ? 'Opera'
      : text.includes('Firefox/') ? 'Firefox'
        : text.includes('Chrome/') ? 'Chrome'
          : text.includes('Safari/') ? 'Safari'
            : 'Browser';
  const platform = text.includes('Windows') ? 'Windows'
    : text.includes('Mac OS') || text.includes('Macintosh') ? 'macOS'
      : text.includes('Android') ? 'Android'
        : text.includes('iPhone') || text.includes('iPad') ? 'iOS'
          : text.includes('Linux') ? 'Linux'
            : 'Unknown device';

  return `${browser} on ${platform}`;
};

const formatDetailValue = (value, key = '') => {
  const normalizedKey = String(key || '').replace(/[_\s-]/g, '').toLowerCase();
  if (value === null || value === undefined || value === '') return 'None';
  if (normalizedKey === 'ip') return formatIpAddress(value);
  if (normalizedKey === 'useragent') return formatUserAgent(value);
  if (normalizedKey === 'customertype') return formatCustomerType(value);
  if (isMovementReasonField(key)) return getStockMovementReasonLabel(value);
  if (['actualtransactionat', 'encodedat', 'transactiondate', 'encodeddate'].includes(normalizedKey)) {
    return formatDateTime(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([nestedKey, nestedValue]) => `${formatFieldLabel(nestedKey)}: ${formatDetailValue(nestedValue, nestedKey)}`)
      .join(', ');
  }
  return String(value);
};

const getDetailEntries = details => Object.entries(normalizeDetails(details))
  .filter(([, value]) => value !== null && value !== undefined && value !== '');

const LONG_DETAIL_FIELDS = new Set(['remarks', 'reason', 'note', 'movementnote', 'cancelreason']);
const isLongDetailField = key => LONG_DETAIL_FIELDS.has(String(key || '').replace(/[_\s-]/g, '').toLowerCase());
const isStructuredDetailValue = value => value && typeof value === 'object';
const shouldUseDetailBlock = (key, value) => isLongDetailField(key) || isStructuredDetailValue(value);

const parseDateInput = (value, endOfDay = false) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

const getDateRangeBounds = (range, customStartDate = '', customEndDate = '') => {
  const now = new Date();
  if (range === 'today') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    };
  }
  if (range === 'sevenDays') {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return { start: date, end: null };
  }
  if (range === 'thirtyDays') {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return { start: date, end: null };
  }
  if (range === 'custom') {
    return {
      start: parseDateInput(customStartDate),
      end: parseDateInput(customEndDate, true)
    };
  }
  return { start: null, end: null };
};

const getRecordTitle = log => {
  const action = formatActionLabel(log.action);
  const target = log.targetName && log.targetName !== 'System record' ? `: ${log.targetName}` : '';
  return `${action}${target}`;
};

export function AuditTrailModule({ user }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [floatingButtonPosition, setFloatingButtonPosition] = useState(null);
  const auditRecordsPanelRef = useRef(null);
  const viewAllFooterRef = useRef(null);
  // Pagination state (page size aligned with reports module)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(apiUrl('/api/audit-logs'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setAuditLogs((res.data.auditLogs || []).map(log => ({
        id: String(log.id ?? ''),
        actorId: log.actor_id ? String(log.actor_id) : '',
        actorName: log.actor_name || 'System',
        targetId: log.target_id ? String(log.target_id) : '',
        targetName: log.target_name || 'System record',
        targetType: log.target_type || '',
        action: log.action || 'UNKNOWN_ACTION',
        reason: log.reason || '',
        details: normalizeDetails(log.details),
        createdAt: log.created_at ? new Date(log.created_at).toISOString() : ''
      })));
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load audit trail.');
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const { start: rangeStart, end: rangeEnd } = getDateRangeBounds(dateFilter, customStartDate, customEndDate);
    const hasInvalidCustomRange = dateFilter === 'custom' && rangeStart && rangeEnd && rangeStart > rangeEnd;
    if (hasInvalidCustomRange) return [];

    return auditLogs.filter(log => {
      const group = getActionGroup(log.action);
      const matchesGroup = actionFilter === 'all' || group === actionFilter;
      const createdAt = log.createdAt ? new Date(log.createdAt) : null;
      const matchesDate = (!rangeStart || (createdAt && createdAt >= rangeStart)) &&
        (!rangeEnd || (createdAt && createdAt <= rangeEnd));
      const haystack = [
        log.id,
        log.actorName,
        log.targetName,
        log.targetType,
        log.reason,
        formatActionLabel(log.action),
        log.targetId,
        log.actorId,
        ...getDetailEntries(log.details).flatMap(([key, value]) => [key, formatDetailValue(value, key)])
      ].join(' ').toLowerCase();
      return matchesGroup && matchesDate && (!query || haystack.includes(query));
    });
  }, [auditLogs, searchQuery, actionFilter, dateFilter, customStartDate, customEndDate]);

  const latestLog = auditLogs[0];
  // Paginate filtered logs
  const paginateItems = (items, pageOverride) => {
    const totalItems = (items?.length || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const page = Math.min(Math.max(1, Number(pageOverride ?? currentPage)), totalPages);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
      pageItems: (items || []).slice(start, end),
      totalPages,
      page,
      totalItems
    };
  };

  const renderPaginationControls = (totalPages, page, setPage, totalItems) => {
    const activePage = Number(page ?? currentPage);
    const setActivePage = setPage ?? setCurrentPage;
    if (!totalPages || totalPages <= 1) return null;
    // Windowed pagination like reports module
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, activePage - 2);
      let end = Math.min(totalPages - 1, activePage + 2);
      if (start > 2) pages.push('left-ellipsis');
      for (let p = start; p <= end; p++) pages.push(p);
      if (end < totalPages - 1) pages.push('right-ellipsis');
      pages.push(totalPages);
    }
    const rangeStart = Math.min(totalItems || totalPages * itemsPerPage, (activePage - 1) * itemsPerPage + 1);
    const rangeEnd = Math.min(totalItems || totalPages * itemsPerPage, activePage * itemsPerPage);
    return (
      <div className="reports-pagination mt-3 flex items-center justify-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setActivePage(p => Math.max(1, Number(p) - 1))} disabled={activePage <= 1}>Previous</Button>
        {pages.map((p, idx) => {
          if (p === 'left-ellipsis' || p === 'right-ellipsis') {
            return (
              <Button key={`${p}-${idx}`} type="button" size="sm" variant="ghost" disabled>
                …
              </Button>
            );
          }
          return (
            <Button key={p} type="button" size="sm" variant={p === activePage ? undefined : 'outline'} onClick={() => setActivePage(p)}>
              {p}
            </Button>
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={() => setActivePage(p => Math.min(totalPages, Number(p) + 1))} disabled={activePage >= totalPages}>Next</Button>
        {typeof totalItems === 'number' && (
          <div className="text-sm text-slate-600 ml-2">{rangeStart}-{rangeEnd} of {totalItems} results</div>
        )}
      </div>
    );
  };

  const paged = paginateItems(filteredLogs);
  const visibleLogs = paged.pageItems;
  const hasMoreRecords = paged.totalItems > itemsPerPage;
  const customRangeStart = parseDateInput(customStartDate);
  const customRangeEnd = parseDateInput(customEndDate, true);
  const hasInvalidCustomRange = dateFilter === 'custom' && customRangeStart && customRangeEnd && customRangeStart > customRangeEnd;

  useEffect(() => {
    setShowAllRecords(false);
    setFloatingButtonPosition(null);
  }, [searchQuery, actionFilter, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    // reset to page 1 when filters change
    setCurrentPage(1);
  }, [searchQuery, actionFilter, dateFilter, customStartDate, customEndDate]);

  // pagination handlers use setCurrentPage directly

  return (
    <div className="audit-trail-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .audit-hero {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          background: linear-gradient(90deg, #EF0015 0%, #FF313D 38%, #FF7A1A 68%, #F7C600 100%);
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.14);
        }

        .audit-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 92% 18%, rgba(255, 255, 0, 0.28), transparent 34%),
            radial-gradient(circle at 18% 90%, rgba(255, 255, 255, 0.14), transparent 30%);
          pointer-events: none;
        }

        .audit-hero-content {
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .audit-hero-main {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          min-width: 0;
        }

        .audit-metric-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .audit-metric-card {
          min-height: 88px;
          border-radius: 12px;
        }

        .audit-metric-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0F172A;
        }

        .audit-metric-icon svg {
          width: 24px;
          height: 24px;
          stroke-width: 2.25;
        }

        .audit-filter-grid {
          display: grid;
          grid-template-columns: minmax(280px, 1.4fr) minmax(210px, 0.8fr) minmax(210px, 0.8fr) auto;
          gap: 18px;
          align-items: end;
        }

        .audit-filter-control {
          height: 60px !important;
          min-height: 60px !important;
          border-radius: 14px !important;
          display: flex;
          align-items: center;
        }

        .audit-filter-control input {
          height: 100%;
        }

        .audit-custom-date-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(180px, 1fr));
          gap: 18px;
          margin-top: 18px;
        }

        .audit-custom-date-note {
          margin-top: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #64748B;
        }

        .audit-custom-date-error {
          color: #B91C1C;
        }

        .audit-record-row {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) 180px 110px 110px 132px;
          gap: 18px;
          align-items: center;
          padding: 16px 18px;
        }

        .audit-detail-list {
          display: grid;
          gap: 8px;
          max-width: 100%;
        }

        .audit-detail-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }

        .audit-detail-chip {
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
          border-radius: 8px;
          background: #F1F5F9;
          padding: 4px 10px;
          font-size: 12px;
          line-height: 1.45;
          color: #334155;
        }

        .audit-detail-block {
          max-width: min(100%, 760px);
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          background: #F8FAFC;
          padding: 9px 11px;
          font-size: 12px;
          line-height: 1.55;
          color: #334155;
        }

        .audit-detail-block strong,
        .audit-detail-chip strong {
          color: #0F172A;
        }

        .audit-detail-block-value {
          display: -webkit-box;
          margin-top: 3px;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .audit-detail-kv-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }

        .audit-detail-kv-row {
          display: grid;
          grid-template-columns: minmax(92px, 0.8fr) minmax(0, 1.2fr);
          gap: 8px;
          align-items: start;
          border-radius: 8px;
          background: #FFFFFF;
          padding: 6px 8px;
          min-width: 0;
        }

        .audit-detail-kv-label {
          color: #64748B;
          font-weight: 600;
          overflow-wrap: anywhere;
        }

        .audit-detail-kv-value {
          color: #0F172A;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .audit-view-all-button {
          border: 1px solid #BFDBFE !important;
          background: #FFFFFF !important;
          color: #1D4ED8 !important;
          box-shadow: 0 5px 14px rgba(15, 23, 42, 0.10);
          transition: background 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
        }

        .audit-view-all-button:hover {
          border-color: #2563EB !important;
          background: #DBEAFE !important;
          color: #1E3A8A !important;
          box-shadow: 0 10px 22px rgba(37, 99, 235, 0.20);
        }

        .audit-view-all-button:active {
          background: #BFDBFE !important;
        }

        .audit-floating-collapse {
          position: fixed;
          z-index: 45;
          display: flex;
          justify-content: center;
          transform: translate(-50%, -50%);
          pointer-events: none;
          transition: left 240ms ease, top 240ms ease, bottom 240ms ease;
        }

        .audit-floating-collapse .audit-view-all-button {
          pointer-events: auto;
        }

        @media (max-width: 1100px) {
          .audit-filter-grid {
            grid-template-columns: minmax(0, 1fr) minmax(220px, 0.7fr);
          }

          .audit-filter-refresh {
            grid-column: span 2;
          }

          .audit-filter-refresh button {
            width: 100%;
          }

          .audit-record-row {
            grid-template-columns: minmax(0, 1fr) 170px 110px;
          }

          .audit-detail-block {
            max-width: 100%;
          }

          .audit-detail-kv-grid {
            grid-template-columns: 1fr;
          }

          .audit-detail-kv-row {
            grid-template-columns: minmax(82px, 0.75fr) minmax(0, 1.25fr);
          }
        }

        @media (max-width: 760px) {
          .audit-trail-page {
            padding: 14px;
          }

          .audit-hero {
            border-radius: 18px;
          }

          .audit-hero-content {
            align-items: flex-start;
            padding: 26px 22px !important;
          }

          .audit-hero-main {
            gap: 1rem;
          }

          .audit-hero-icon {
            width: 58px !important;
            height: 58px !important;
            border-radius: 16px !important;
          }

          .audit-hero-title {
            font-size: 34px !important;
            line-height: 1.05 !important;
          }

          .audit-metric-grid,
          .audit-filter-grid,
          .audit-custom-date-grid,
          .audit-record-row {
            grid-template-columns: 1fr;
          }

          .audit-filter-refresh {
            grid-column: auto;
          }

          .audit-record-row {
            position: relative;
            gap: 12px;
            padding: 16px;
            padding-top: 52px;
          }

          .audit-floating-collapse {
            transform: translate(-50%, -50%);
          }

          .audit-floating-collapse .audit-view-all-button {
            width: auto;
            height: 40px;
            min-width: 0;
          }

          .audit-action-badge-cell {
            position: absolute;
            right: 16px;
            top: 16px;
            text-align: right;
          }
        }
      `}</style>

      <section className="audit-hero mb-6">
        <div className="audit-hero-content relative z-10 flex items-center gap-6 p-8">
          <div className="audit-hero-main">
          <div className="audit-hero-icon flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <div className="min-w-0 text-white">
            <h1 className="audit-hero-title text-4xl font-bold leading-tight">Audit Trail</h1>
            <p className="mt-2 text-lg font-medium text-white/95">
              Review important system actions and accountability records.
            </p>
            {user?.branch && user?.role && (
              <p className="mt-2 text-sm text-white/85">
                {user.branch} Branch - {user.role}
              </p>
            )}
          </div>
          </div>
          <HeaderTimeBadge userBranch={user?.branch} />
        </div>
      </section>

      <div className="audit-metric-grid mb-6">
        <Card className="audit-metric-card border-slate-200 bg-white shadow-sm">
          <CardContent className="flex h-full items-center gap-4 p-5">
            <div className="audit-metric-icon shrink-0" aria-hidden="true">
              <Database />
            </div>
            <div>
              <p className="text-sm text-slate-700">Total Records</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{auditLogs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="audit-metric-card border-slate-200 bg-white shadow-sm">
          <CardContent className="flex h-full items-center gap-4 p-5">
            <div className="audit-metric-icon shrink-0" aria-hidden="true">
              <Eye />
            </div>
            <div>
              <p className="text-sm text-slate-700">Visible After Filters</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{filteredLogs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="audit-metric-card border-slate-200 bg-white shadow-sm">
          <CardContent className="flex h-full items-center gap-4 p-5">
            <div className="audit-metric-icon shrink-0" aria-hidden="true">
              <Clock />
            </div>
            <div>
              <p className="text-sm text-slate-700">Latest Activity</p>
              <p className="mt-1 text-base font-semibold text-slate-950">
                {latestLog ? formatDateTime(latestLog.createdAt) : 'No activity yet'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6 rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-5">
          <CardTitle className="text-lg text-slate-950">Audit Filters</CardTitle>
          <CardDescription>Search and filter audit trail records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="audit-filter-grid">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search by user, record, action, item, or ID"
                  className="audit-filter-control border-slate-200 bg-slate-50 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Action Type</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="audit-filter-control border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Filter by action type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_GROUPS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Date Range</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="audit-filter-control border-slate-200 bg-slate-50">
                  <CalendarDays className="mr-2 h-4 w-4 text-slate-500" />
                  <SelectValue placeholder="Filter by date" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATE_RANGES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="audit-filter-refresh flex items-end">
              <Button type="button" variant="outline" onClick={fetchAuditLogs} disabled={loading} className="audit-filter-control w-full px-5 lg:w-auto">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          {dateFilter === 'custom' && (
            <div>
              <div className="audit-custom-date-grid" aria-label="Custom audit date range">
                <div className="space-y-2">
                  <label htmlFor="audit-start-date" className="text-sm font-medium text-slate-700">Start Date</label>
                  <Input
                    id="audit-start-date"
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={event => setCustomStartDate(event.target.value)}
                    className="audit-filter-control border-slate-200 bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="audit-end-date" className="text-sm font-medium text-slate-700">End Date</label>
                  <Input
                    id="audit-end-date"
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={event => setCustomEndDate(event.target.value)}
                    className="audit-filter-control border-slate-200 bg-slate-50"
                  />
                </div>
              </div>
              <p className={`audit-custom-date-note ${hasInvalidCustomRange ? 'audit-custom-date-error' : ''}`}>
                {hasInvalidCustomRange
                  ? 'Start Date must be earlier than or the same as End Date.'
                  : 'Custom range includes all records from the start date through the end date.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg text-slate-950">Activity Records</CardTitle>
          <CardDescription>
            Admin-only view of recent system actions. These records help explain who changed what and when.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-700">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              Loading audit trail...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-700">
              <p>No audit records match the current filters.</p>
            </div>
          ) : (
            <div ref={auditRecordsPanelRef} className="overflow-hidden rounded-xl border border-slate-200">
              {visibleLogs.map((log, index) => {
                const group = getActionGroup(log.action);
                const details = getDetailEntries(log.details);
                return (
                  <article
                    key={log.id}
                    className={`audit-record-row bg-white transition-colors hover:bg-slate-50 ${index > 0 ? 'border-t border-slate-200' : ''}`}
                  >
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-relaxed text-slate-950">
                        {getRecordTitle(log)}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)}</p>
                      {log.reason && <p className="mt-2 text-sm text-slate-600">{log.reason}</p>}
                      {details.length > 0 && (() => {
                        const visibleDetails = details.slice(0, 4);
                        const blockDetails = visibleDetails.filter(([key, value]) => shouldUseDetailBlock(key, value));
                        const shortDetails = visibleDetails.filter(([key, value]) => !shouldUseDetailBlock(key, value));
                        return (
                          <div className="audit-detail-list mt-2">
                            {blockDetails.map(([key, value]) => (
                              <div key={key} className="audit-detail-block">
                                <strong>{formatFieldLabel(key)}</strong>
                                {isStructuredDetailValue(value) ? (
                                  <div className="audit-detail-kv-grid">
                                    {Object.entries(value)
                                      .filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined && nestedValue !== '')
                                      .map(([nestedKey, nestedValue]) => (
                                        <div key={nestedKey} className="audit-detail-kv-row">
                                          <span className="audit-detail-kv-label">{formatFieldLabel(nestedKey)}</span>
                                          <span className="audit-detail-kv-value">{formatDetailValue(nestedValue, nestedKey)}</span>
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <span className="audit-detail-block-value">{formatDetailValue(value, key)}</span>
                                )}
                              </div>
                            ))}
                            {shortDetails.length > 0 && (
                              <div className="audit-detail-chips">
                                {shortDetails.map(([key, value]) => (
                                  <span key={key} className="audit-detail-chip">
                                    <strong>{formatFieldLabel(key)}:</strong> {formatDetailValue(value, key)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Performed By</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{log.actorName}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Audit ID</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{log.id || 'N/A'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">User ID</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{log.actorId || 'System'}</p>
                    </div>

                    <div className="audit-action-badge-cell lg:text-right">
                      <Badge className={`inline-flex min-h-7 items-center justify-center rounded-lg px-3 py-1 text-center ${getActionBadgeClass(group)}`}>
                        {ACTION_GROUPS[group]}
                      </Badge>
                    </div>
                  </article>
                );
              })}
              {paged.totalPages > 1 && (
                <div className="border-t border-slate-200 bg-white px-4 py-4 text-center">
                  {renderPaginationControls(paged.totalPages, paged.page, setCurrentPage, paged.totalItems)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* pagination replaces the previous View All behavior */}
    </div>
  );
}
