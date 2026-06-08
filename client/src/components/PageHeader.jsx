/**
 * Page Header Components
 *
 * Provides a shared branded header for modules, including title text,
 * optional actions, current branch, and live date/time display.
 */
import React, { useEffect, useState } from 'react';

/**
 * Builds the branch label shown in the header time badge.
 *
 * @param {string} userBranch - Branch assigned to the current session.
 * @returns {string} Branch label or unavailable fallback.
 */
const getLocationLabel = userBranch => {
  if (userBranch) return `${userBranch} Branch`;
  return 'Branch unavailable';
};

/**
 * Resolves the active branch from browser session storage.
 *
 * @returns {string} Stored active branch, stored user branch, or empty string.
 */
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

/**
 * Formats a Date object for header display.
 *
 * @param {Date} date - Date to format.
 * @returns {string} Localized date label or unavailable fallback.
 */
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

/**
 * Formats a Date object as a live clock label.
 *
 * @param {Date} date - Date to format.
 * @returns {string} Localized time label or unavailable fallback.
 */
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

/**
 * Displays the current branch, date, and live time in the page header.
 *
 * @param {object} props - Component props.
 * @param {string} props.userBranch - Branch label to prefer over session storage.
 * @returns {JSX.Element} Live branch/date/time badge.
 */
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
  const dateTimeLabel = hasDateTimeError ? 'Date/time unavailable' : `${dateLabel} \u00B7 ${timeLabel}`;

  return (
    <>
      <style>{`
        /* Header time badge keeps branch and clock visible without overflowing. */
        .page-header-time-badge {
          display: grid;
          gap: 0.2rem;
          max-width: min(100%, 42rem);
          color: #172033;
          text-align: right;
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.55);
        }

        .page-header-branch-label,
        .page-header-date-time-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .page-header-branch-label {
          font-size: 0.95rem;
          font-weight: 850;
          line-height: 1.25;
        }

        .page-header-date-time-label {
          font-size: 0.84rem;
          font-weight: 650;
          line-height: 1.3;
        }

        /* Tablet layout moves the badge under the title area when needed. */
        @media (max-width: 920px) {
          .page-header-time-badge {
            width: 100%;
            max-width: 100%;
            text-align: left;
          }
        }

        /* Mobile layout allows branch and timestamp text to wrap to two lines. */
        @media (max-width: 640px) {
          .page-header-time-badge {
            gap: 0.16rem;
          }

          .page-header-branch-label {
            font-size: 0.82rem;
          }

          .page-header-date-time-label {
            font-size: 0.76rem;
          }

          .page-header-branch-label,
          .page-header-date-time-label {
            display: -webkit-box;
            overflow: hidden;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }
        }
      `}</style>
      <div className="page-header-time-badge" aria-label="Current branch date and time" title={timestampLabel}>
        <div className="page-header-branch-label">{locationLabel}</div>
        <div className="page-header-date-time-label">{dateTimeLabel}</div>
      </div>
    </>
  );
}

/**
 * Renders the branded module header used across the application.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Main module title.
 * @param {string} props.subtitle - Supporting subtitle text.
 * @param {React.ReactNode} props.icon - Optional module icon.
 * @param {React.ReactNode} props.children - Optional header controls/actions.
 * @param {string} props.userName - Optional user name for greeting text.
 * @param {string} props.userBranch - Optional branch override.
 * @param {string} props.userRole - Optional role label for user context.
 * @param {boolean} [props.showUserContext=false] - Shows user/branch/role context when true.
 * @returns {JSX.Element} Shared page header.
 */
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
