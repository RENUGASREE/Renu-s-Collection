/**
 * Delivery estimate utility for Renu's Collections.
 * Calculates 5–7 business days (excluding Sat/Sun) from order placement.
 * Uses Asia/Kolkata timezone consistently.
 */

const IST_TZ = 'Asia/Kolkata';

/** Get the IST calendar date parts from a Date object */
function toISTDate(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  let year = 0, month = 0, day = 0;
  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

/** Add N business days (skip Sat=6, Sun=0) to a base date, starting from next day */
function addBusinessDays(baseDate: Date, businessDays: number): Date {
  const ist = toISTDate(baseDate);
  // Start from midnight IST of the order day
  const current = new Date(`${ist.year}-${String(ist.month).padStart(2, '0')}-${String(ist.day).padStart(2, '0')}T00:00:00+05:30`);
  
  let added = 0;
  while (added < businessDays) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return current;
}

/** Format a date for display in IST */
function formatDateIST(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Short format for compact displays */
function formatDateShortIST(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
  });
}

export interface DeliveryEstimate {
  startDate: Date;
  endDate: Date;
  /** e.g. "19 October 2026 – 21 October 2026" */
  formatted: string;
  /** e.g. "19 Oct – 21 Oct" */
  formattedShort: string;
}

/**
 * Calculate estimated delivery window: 5–7 business days from order creation.
 * Returns null if the input is invalid.
 */
export function getEstimatedDeliveryWindow(createdAt: string | Date): DeliveryEstimate | null {
  try {
    const orderDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    if (isNaN(orderDate.getTime())) return null;

    const startDate = addBusinessDays(orderDate, 5);
    const endDate = addBusinessDays(orderDate, 7);

    return {
      startDate,
      endDate,
      formatted: `${formatDateIST(startDate)} – ${formatDateIST(endDate)}`,
      formattedShort: `${formatDateShortIST(startDate)} – ${formatDateShortIST(endDate)}`,
    };
  } catch {
    return null;
  }
}
