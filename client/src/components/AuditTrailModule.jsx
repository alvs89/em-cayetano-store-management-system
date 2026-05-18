import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CalendarDays, Clock, Database, Eye, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { HeaderTimeBadge } from './PageHeader';

const ACTION_GROUPS = {
  all: 'All Actions',
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
  thirtyDays: 'Last 30 Days'
};

const DEFAULT_VISIBLE_RECORDS = 5;

const getActionGroup = action => {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('STOCK') || normalized.includes('ITEM') || normalized.includes('DUPLICATE')) return 'inventory';
  if (normalized.includes('ARCHIVE') || normalized.includes('RESTORE_ITEM')) return 'archive';
  if (normalized.includes('USER') || normalized.includes('ROLE') || normalized.includes('BRANCH') || normalized.includes('APPROVE') || normalized.includes('DEACTIVATE')) return 'users';
  if (normalized.includes('BACKUP') || normalized.includes('DATABASE') || normalized.includes('LOGS') || normalized.includes('OPTIMIZE') || normalized.includes('INTEGRITY')) return 'maintenance';
  if (normalized.includes('ALERT')) return 'alerts';
  if (normalized.includes('REPORT')) return 'reports';
  return 'inventory';
};

const getActionBadgeClass = group => {
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

const formatFieldLabel = value => String(value || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/_/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

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
    regular: 'Regular Customer',
    contractor: 'Contractor'
  };
  return customerTypes[String(value || '').toLowerCase()] || formatFieldLabel(value) || 'None';
};

const formatDetailValue = (value, key = '') => {
  if (value === null || value === undefined || value === '') return 'None';
  if (String(key || '').toLowerCase() === 'customertype') return formatCustomerType(value);
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

const getDateRangeStart = range => {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'sevenDays') {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return date;
  }
  if (range === 'thirtyDays') {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return date;
  }
  return null;
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
  const [showAllRecords, setShowAllRecords] = useState(false);

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
    const rangeStart = getDateRangeStart(dateFilter);
    return auditLogs.filter(log => {
      const group = getActionGroup(log.action);
      const matchesGroup = actionFilter === 'all' || group === actionFilter;
      const createdAt = log.createdAt ? new Date(log.createdAt) : null;
      const matchesDate = !rangeStart || (createdAt && createdAt >= rangeStart);
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
  }, [auditLogs, searchQuery, actionFilter, dateFilter]);

  const latestLog = auditLogs[0];
  const visibleLogs = showAllRecords ? filteredLogs : filteredLogs.slice(0, DEFAULT_VISIBLE_RECORDS);
  const hasMoreRecords = filteredLogs.length > DEFAULT_VISIBLE_RECORDS;

  useEffect(() => {
    setShowAllRecords(false);
  }, [searchQuery, actionFilter, dateFilter]);

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

        .audit-record-row {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) 180px 110px 110px 132px;
          gap: 18px;
          align-items: center;
          padding: 16px 18px;
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
          .audit-record-row {
            grid-template-columns: 1fr;
          }

          .audit-filter-refresh {
            grid-column: auto;
          }

          .audit-record-row {
            gap: 12px;
            padding: 16px;
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
              <p className="text-sm text-slate-500">Total Records</p>
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
              <p className="text-sm text-slate-500">Visible After Filters</p>
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
              <p className="text-sm text-slate-500">Latest Activity</p>
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
            <div className="flex items-center justify-center py-12 text-slate-500">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
              Loading audit trail...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-500">
              <p>No audit records match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
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
                      {details.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {details.slice(0, 4).map(([key, value]) => (
                            <span key={key} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                              <strong>{formatFieldLabel(key)}:</strong> {formatDetailValue(value, key)}
                            </span>
                          ))}
                        </div>
                      )}
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

                    <div className="lg:text-right">
                      <Badge className={`inline-flex min-h-7 items-center justify-center rounded-lg px-3 py-1 text-center ${getActionBadgeClass(group)}`}>
                        {ACTION_GROUPS[group]}
                      </Badge>
                    </div>
                  </article>
                );
              })}
              {hasMoreRecords && (
                <div className="border-t border-slate-200 bg-white px-4 py-4 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="audit-view-all-button h-10 rounded-xl px-5"
                    onClick={() => setShowAllRecords(prev => !prev)}
                  >
                    {showAllRecords ? 'Show fewer records' : `View all records (${filteredLogs.length})`}
                    <ArrowRight className={`ml-2 h-4 w-4 ${showAllRecords ? '-rotate-90' : ''}`} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
