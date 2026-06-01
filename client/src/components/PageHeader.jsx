// Shared page header: keeps module titles, branch labels, and header actions
// visually consistent across the application.
import React, { useEffect, useState } from 'react';

const getLocationLabel = userBranch => {
  if (userBranch) return `${userBranch} Branch`;
  return 'Branch unavailable';
};

const getSessionBranch = () => {
  try {
    const activeBranch = localStorage.getItem('active_branch');
    if (activeBranch) return activeBranch;

    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    return storedUser.branch || '';
  } catch {
    return '';
  }
};

const formatDate = date => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch {
    return 'Date/time unavailable';
  }
};

const formatTime = date => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date);
  } catch {
    return 'Date/time unavailable';
  }
};

export function HeaderTimeBadge({ userBranch }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const locationLabel = getLocationLabel(userBranch || getSessionBranch());
  const dateLabel = formatDate(now);
  const timeLabel = formatTime(now);
  const hasDateTimeError = dateLabel === 'Date/time unavailable' || timeLabel === 'Date/time unavailable';
  const timestampLabel = hasDateTimeError
    ? 'Date/time unavailable'
    : `${locationLabel} \u00B7 ${dateLabel} \u00B7 ${timeLabel}`;

  return (
    <>
      <style>{`
        .page-header-time-badge {
          max-width: min(100%, 42rem);
          color: #172033;
          font-size: 0.88rem;
          font-weight: 700;
          line-height: 1.35;
          text-align: right;
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.55);
        }

        .page-header-time-primary {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 920px) {
          .page-header-time-badge {
            width: 100%;
            max-width: 100%;
            text-align: left;
          }
        }

        @media (max-width: 640px) {
          .page-header-time-badge {
            font-size: 0.78rem;
          }

          .page-header-time-primary {
            display: -webkit-box;
            overflow: hidden;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }
        }
      `}</style>
      <div className="page-header-time-badge" aria-label="Current branch date and time" title={timestampLabel}>
        <div className="page-header-time-primary">{timestampLabel}</div>
      </div>
    </>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  children,
  userName,
  userBranch,
  userRole,
  showUserContext = false
}) {
  const resolvedUserBranch = userBranch || getSessionBranch();

  return (
    <div className="mb-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-yellow-500 p-8 shadow-xl">
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-[#FFFF00] opacity-20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-white opacity-10 blur-3xl" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center">
              {icon && (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
                  {icon}
                </div>
              )}
              <div className="min-w-0" style={icon ? { marginLeft: 20 } : undefined}>
                <h1 className="mb-2 text-4xl font-bold text-white">{title}</h1>
                {subtitle && (
                  <p className="text-lg text-white/95">
                    {subtitle}
                    {showUserContext && userName && (
                      <>
                        {' '}
                        <span className="font-semibold">{userName}</span>!
                      </>
                    )}
                  </p>
                )}
                {showUserContext && resolvedUserBranch && userRole && (
                  <p className="mt-1 text-sm text-white/80">
                    {resolvedUserBranch} Branch - {userRole}
                  </p>
                )}
              </div>
            </div>

            <HeaderTimeBadge userBranch={resolvedUserBranch} />
          </div>

          {children && <div className="mt-6">{children}</div>}
        </div>
      </div>
    </div>
  );
}
