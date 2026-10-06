const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(time: number, withSeconds = false): string {
  const d = new Date(time);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekday = (time: number) => WEEKDAYS[new Date(time).getDay()];

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}일 ${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatSigned(value: number, digits = 2): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}`;
}

export const pnlClass = (value: number) => (value > 0 ? 'up' : value < 0 ? 'down' : '');
