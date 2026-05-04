import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';

export function PageHeader({
  title,
  subtitle,
  icon,
  children,
  userName,
  userBranch,
  userRole,
  onNavigate,
  showQuickActions = false,
  alertCount = 0
}) {
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
                <p className="text-lg text-white/95">
                  {subtitle}
                  {userName && (
                    <>
                      {' '}
                      <span className="font-semibold">{userName}</span>!
                    </>
                  )}
                </p>
                {userBranch && userRole && (
                  <p className="mt-1 text-sm text-white/80">
                    {userBranch} Branch • {userRole}
                  </p>
                )}
              </div>
            </div>

            {showQuickActions && onNavigate && (
              <div className="flex gap-3">
                <Button
                  onClick={() => onNavigate('alerts')}
                  className="border-2 border-white bg-white text-red-600 shadow-lg hover:bg-red-50"
                >
                  <Bell className="mr-2 h-4 w-4" />
                  Alerts {alertCount > 0 && `(${alertCount})`}
                </Button>
              </div>
            )}
          </div>

          {children && <div className="mt-6">{children}</div>}
        </div>
      </div>
    </div>
  );
}
