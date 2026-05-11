import type { ScheduleRequest, ScheduleResponse } from '../types/schedule';

export function exportToJSON(data: ScheduleRequest | ScheduleResponse, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportScheduleToCSV(response: ScheduleResponse, matches: any[], intervalMinutes: number = 30) {
  const formatTime = (slotIndex: number) => {
    const minutes = slotIndex * intervalMinutes;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const headers = ['Match ID', 'Event Rank', 'Slot', 'Start Time', 'Court', 'Duration (Slots)'];
  const rows = response.assignments.map((assignment) => {
    const match = matches.find((m) => m.id === assignment.matchId);
    return [
      assignment.matchId,
      match?.eventRank || assignment.matchId,
      assignment.slotId.toString(),
      formatTime(assignment.slotId),
      assignment.courtId.toString(),
      assignment.durationSlots.toString(),
    ];
  });

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schedule_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
