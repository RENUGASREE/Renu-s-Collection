import React from 'react';
import {
  Package,
  Settings,
  Truck,
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

interface StatusHistoryEntry {
  status: string;
  note?: string;
  changedAt: string;
  changedBy?: string;
}

interface OrderProgressTrackerProps {
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
}

/** The five visual stages of order progress */
const STAGES = [
  { key: 'pending', label: 'Order Placed', icon: Package },
  { key: 'processing', label: 'Processing', icon: Settings },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: MapPin },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
] as const;

type StageKey = typeof STAGES[number]['key'];

/** Map backend status to which stages are completed */
function getCompletedStages(status: OrderStatus): Set<StageKey> {
  const completed = new Set<StageKey>();
  const progression: StageKey[] = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
  
  const statusToStageIdx: Record<OrderStatus, number> = {
    pending: 0,
    processing: 1,
    shipped: 2,
    delivered: 4, // includes out_for_delivery visually
    cancelled: -1,
    refunded: -1,
  };

  const idx = statusToStageIdx[status];
  if (idx < 0) return completed;

  for (let i = 0; i <= idx; i++) {
    completed.add(progression[i]);
  }
  return completed;
}

/** Get the current active stage key */
function getCurrentStage(status: OrderStatus): StageKey | null {
  const map: Partial<Record<OrderStatus, StageKey>> = {
    pending: 'pending',
    processing: 'processing',
    shipped: 'shipped',
    delivered: 'delivered',
  };
  return map[status] || null;
}

/** Find timestamp from statusHistory for a given status */
function getTimestamp(statusHistory: StatusHistoryEntry[], statusKey: string): string | null {
  const entry = statusHistory.find(h => h.status === statusKey);
  return entry ? entry.changedAt : null;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Find the last real status before cancellation/refund */
function getLastActiveStatus(statusHistory: StatusHistoryEntry[]): OrderStatus {
  const activeStatuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];
  for (let i = statusHistory.length - 1; i >= 0; i--) {
    const s = statusHistory[i].status as OrderStatus;
    if (activeStatuses.includes(s)) return s;
  }
  return 'pending';
}

export default function OrderProgressTracker({ status, statusHistory, createdAt }: OrderProgressTrackerProps) {
  const isCancelled = status === 'cancelled' || status === 'refunded';
  
  // For cancelled/refunded, show progress up to last active status
  const effectiveStatus = isCancelled ? getLastActiveStatus(statusHistory) : status;
  const completedStages = getCompletedStages(effectiveStatus);
  const currentStage = getCurrentStage(effectiveStatus);

  // Map stage keys to backend status keys for timestamp lookup
  const stageToBackendStatus: Record<StageKey, string> = {
    pending: 'pending',
    processing: 'processing',
    shipped: 'shipped',
    out_for_delivery: 'out_for_delivery', // won't exist in history
    delivered: 'delivered',
  };

  return (
    <div className="space-y-4">
      {/* Progress Steps */}
      <div className="relative">
        {STAGES.map((stage, idx) => {
          const isCompleted = completedStages.has(stage.key);
          const isCurrent = stage.key === currentStage && !isCancelled;
          const isUpcoming = !isCompleted && !isCurrent;
          const StageIcon = stage.icon;

          // Get timestamp - for 'pending' use createdAt, for others check history
          let timestamp: string | null = null;
          if (stage.key === 'pending' && (isCompleted || isCurrent)) {
            timestamp = createdAt;
          } else if (isCompleted || isCurrent) {
            timestamp = getTimestamp(statusHistory, stageToBackendStatus[stage.key]);
          }

          // Determine colors
          let dotClasses = '';
          let lineClasses = '';
          let labelClasses = '';

          if (isCompleted) {
            dotClasses = 'bg-[#B66F72] dark:bg-primary text-white dark:text-primary-foreground ring-4 ring-[#B66F72]/15 dark:ring-primary/15';
            lineClasses = 'bg-[#B66F72] dark:bg-primary';
            labelClasses = 'text-[#342824] dark:text-foreground font-semibold';
          } else if (isCurrent) {
            dotClasses = 'bg-[#B66F72] dark:bg-primary text-white dark:text-primary-foreground ring-4 ring-[#B66F72]/20 dark:ring-primary/20 animate-pulse';
            lineClasses = 'bg-[#E6D8D0] dark:bg-border';
            labelClasses = 'text-[#B66F72] dark:text-primary font-semibold';
          } else {
            dotClasses = 'bg-[#E6D8D0] dark:bg-muted text-[#756861] dark:text-muted-foreground';
            lineClasses = 'bg-[#E6D8D0] dark:bg-border';
            labelClasses = 'text-[#756861]/60 dark:text-muted-foreground/60';
          }

          return (
            <div key={stage.key} className="flex items-start gap-3 relative">
              {/* Vertical connector line */}
              {idx < STAGES.length - 1 && (
                <div
                  className={`absolute left-[15px] top-[34px] w-0.5 h-[calc(100%-2px)] ${
                    isCompleted && !isCancelled ? 'bg-[#B66F72] dark:bg-primary' : 'bg-[#E6D8D0] dark:bg-border'
                  }`}
                />
              )}

              {/* Stage dot/icon */}
              <div className={`relative z-10 w-[31px] h-[31px] rounded-full flex items-center justify-center shrink-0 transition-all ${dotClasses}`}>
                <StageIcon className="w-3.5 h-3.5" />
              </div>

              {/* Stage content */}
              <div className={`flex-1 pb-5 ${idx === STAGES.length - 1 ? 'pb-0' : ''}`}>
                <p className={`text-sm ${labelClasses}`}>
                  {stage.label}
                </p>
                {timestamp && (
                  <p className="text-[11px] text-[#756861]/70 dark:text-muted-foreground/70 mt-0.5">
                    {formatTimestamp(timestamp)}
                  </p>
                )}
                {isCurrent && !isCancelled && (
                  <p className="text-[11px] text-[#B66F72] dark:text-primary mt-0.5 font-medium">
                    Current Status
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancellation / Refund Banner */}
      {isCancelled && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
          <XCircle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-300 capitalize">
              Order {status}
            </p>
            {(() => {
              const cancelEntry = statusHistory.find(h => h.status === status);
              return cancelEntry ? (
                <>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                    {formatTimestamp(cancelEntry.changedAt)}
                  </p>
                  {cancelEntry.note && (
                    <p className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1">
                      {cancelEntry.note}
                    </p>
                  )}
                </>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
