'use client';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-muted rounded-lg p-6 h-32 flex flex-col justify-between"
          >
            <div className="h-4 bg-muted-foreground/20 rounded w-20" />
            <div className="h-8 bg-muted-foreground/20 rounded w-24" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="bg-muted rounded-lg p-6 h-64">
        <div className="h-4 bg-muted-foreground/20 rounded w-32 mb-4" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 bg-muted-foreground/20 rounded w-full" />
          ))}
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-muted rounded-lg p-6 space-y-4">
        <div className="h-4 bg-muted-foreground/20 rounded w-32" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted-foreground/10 rounded" />
        ))}
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-muted rounded-lg p-6 h-32 flex flex-col justify-between animate-pulse">
      <div className="h-4 bg-muted-foreground/20 rounded w-20" />
      <div className="h-8 bg-muted-foreground/20 rounded w-24" />
      <div className="h-3 bg-muted-foreground/10 rounded w-16" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-muted rounded-lg p-6 h-64 animate-pulse">
      <div className="h-4 bg-muted-foreground/20 rounded w-32 mb-6" />
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-8 bg-muted-foreground/20 rounded"
            style={{ width: `${Math.random() * 40 + 40}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden animate-pulse">
      {/* Header */}
      <div className="bg-muted p-4 flex gap-4">
        <div className="h-4 bg-muted-foreground/20 rounded flex-1" />
        <div className="h-4 bg-muted-foreground/20 rounded flex-1" />
        <div className="h-4 bg-muted-foreground/20 rounded flex-1" />
      </div>
      {/* Rows */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="border-t border-border p-4 flex gap-4">
          <div className="h-4 bg-muted-foreground/10 rounded flex-1" />
          <div className="h-4 bg-muted-foreground/10 rounded flex-1" />
          <div className="h-4 bg-muted-foreground/10 rounded flex-1" />
        </div>
      ))}
    </div>
  );
}
