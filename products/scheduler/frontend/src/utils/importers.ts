import type { ScheduleRequest } from '../types/schedule';

export async function importFromJSON(file: File): Promise<ScheduleRequest> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ScheduleRequest;
        resolve(data);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function importFromCSV(_file: File): Promise<ScheduleRequest> {
  // CSV import would need to be implemented based on specific format
  // For now, just throw an error indicating it's not implemented
  throw new Error('CSV import not yet implemented. Please use JSON format.');
}
