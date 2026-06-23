function formatTaskTime(dateStr) {
  if (!dateStr || !dateStr.includes('T')) return '';
  const d = new Date(dateStr);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mStr = m < 10 ? '0' + m : m;
  return `🕒 ${h}:${mStr} ${ampm} | `;
}
console.log(formatTaskTime('2026-06-24T21:30:00.000+08:00'));
console.log(formatTaskTime('2026-06-24'));
