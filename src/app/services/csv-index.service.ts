import { Injectable } from '@angular/core';

export interface CsvRow {
  TestsetID: string;
  PID: string;
  Name?: string;
  pubsInFilter: number;
  uniqueCoauthorsInFilter: number;
  avgCoauthorStrengthInSet: number;
  avgCoauthorStrengthGlobal: number;
  downloadName: string;
}

@Injectable({
  providedIn: 'root'
})
export class CsvIndexService {

  private readonly store = new Map<string, CsvRow[]>();

  appendRow(row: CsvRow) {
    const arr = this.store.get(row.TestsetID) ?? [];
    arr.push(row);
    this.store.set(row.TestsetID, arr);
  }

  rows(testsetId: string): CsvRow[] {
    return this.store.get(testsetId) ?? [];
  }

  clear(testsetId: string) {
    this.store.delete(testsetId);
  }

  download(testsetId: string) {
    const rows = this.rows(testsetId);
    const headers = [
      'TestsetID','PID','Name',
      'pubsInFilter','uniqueCoauthorsInFilter',
      'avgCoauthorStrengthInSet','avgCoauthorStrengthGlobal',
      'downloadName'
    ];
    const esc = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${testsetId}_index.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
