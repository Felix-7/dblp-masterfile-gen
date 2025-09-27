import { Component } from '@angular/core';
import { DblpService } from '../../services/dblp.service';
import { MasterfileGeneratorService } from '../../services/masterfile-generator.service';
import { FormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';
import {MasterfileAdapterService} from '../../services/masterfile-adapter.service';
import {DblpFilters, DblpSparqlService} from '../../services/dblp-sparql.service';
import {firstValueFrom} from 'rxjs';
import {CsvIndexService} from '../../services/csv-index.service';

@Component({
  selector: 'app-author-search',
  templateUrl: './author-search.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NgForOf
  ],
  styleUrls: ['./author-search.component.css']
})
export class AuthorSearchComponent {
  authorName: string = '';
  authorPid = '';
  suggestions: any[] = [];

  masterfileLines: string[] = [];
  metaJson = '';

  loading = false;

  statsSummary: string | null = null;
  noResults = false;

  types: Record<string, boolean> = { Article: true, Inproceedings: true, Incollection: false, Informal: false, Book: false };
  venueSuffix?: string;
  minAuthorPubs = 0;
  focusTopAuthors = 0;
  yearMin?: number;
  yearMax?: number;

  massMode = {
    enabled: false,
    testsetId: '',
    seq: 1
  };


  constructor(
    private readonly dblpService: DblpService,
    private readonly masterfileService: MasterfileGeneratorService,
    private readonly sparql: DblpSparqlService,
    private readonly mfAdapter: MasterfileAdapterService,
    private readonly csvIndex: CsvIndexService
  ) {}

  // Build suggestion list
  searchAuthor() {
    this.dblpService.findAuthor(this.authorName).subscribe(response => {
      if (response && response.result && response.result.hits && response.result.hits.hit) {
        this.suggestions = response.result.hits.hit.map((hit: any) => {
          const note = hit.info.notes && hit.info.notes.note
            ? (Array.isArray(hit.info.notes.note)
              ? hit.info.notes.note[0].text
              : hit.info.notes.note.text)
            : '';
          const hint = `${hit.info.author}${note ? ' (' + note + ')' : ''}`;
          // Extract ID from URL
          const matches = hit.info.url.match(/\w+\/[A-Za-z0-9_-]+$/);
          const id = matches ? matches[0] : '';
          return { hint, author: { id, name: hit.info.author } };
        });
      }
    });
  }

  selectAuthor(suggestion: any) {
    this.authorPid = suggestion.author.id;
    this.authorName = suggestion.author.name;
    this.suggestions = []; // collapse suggestions list
  }

  downloadMasterfile() {
    const canonical = this.canonicalMasterName();
    const prefixed = (this.massMode.enabled && this.massMode.testsetId)
      ? `${this.nextPrefix()}_${canonical}`
      : canonical;

    // download file
    const blob = new Blob([this.masterfileLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = prefixed;
    a.click();
    window.URL.revokeObjectURL(url);

    // CSV append (only downloadName)
    if (this.massMode.enabled && this.massMode.testsetId && this.metaJson) {
      try {
        const meta = JSON.parse(this.metaJson);
        const s = meta.stats;
        const pubs = s.publications ?? s.papers ?? 0;
        const coDistinct = s.distinctCoauthorsInSet ?? 0;

        this.csvIndex.appendRow({
          TestsetID: this.massMode.testsetId,
          PID: this.authorPid,
          Name: this.authorName || '',
          pubsInFilter: pubs,
          uniqueCoauthorsInFilter: coDistinct,
          avgCoauthorStrengthInSet: Number(s.avgCoauthorStrengthInSet_overall ?? 0),
          avgCoauthorStrengthGlobal: Number(s.avgCoauthorStrengthGlobal_overall ?? 0),
          downloadName: prefixed
        });

        // bump sequence for next file
        this.massMode.seq = Math.max(1, Math.floor(this.massMode.seq || 1)) + 1;
      } catch (e) {
        console.warn('CSV append skipped (meta JSON parse failed):', e);
      }
    }
  }

  private selectedTypes(): DblpFilters['types'] {
    return (Object.keys(this.types))
      .filter(k => this.types[k]) as any;
  }

  async generateWithSparql(): Promise<void> {
    if (!this.authorPid) return;
    this.loading = true;
    this.noResults = false;
    try {
      const filters: DblpFilters = {
        protagonistPid: this.authorPid,
        types: this.selectedTypes(),
        venueSuffix: this.venueSuffix ?? undefined,
        minAuthorPubs: this.minAuthorPubs || 0,
        focusTopAuthors: this.focusTopAuthors || 0,
        yearMin: this.yearMin,
        yearMax: this.yearMax
      };

      const query = this.sparql.buildQuery(filters);
      const rows = await firstValueFrom(this.sparql.runQuery(query));

      if (rows.length === 0) {
        this.noResults = true;
        this.masterfileLines = [];
        this.metaJson = '';
        this.statsSummary = null;
        return;
      }

      const built = this.mfAdapter.toMasterfile(
        this.masterfileService,
        rows,
        { id: this.authorPid, name: this.authorName },
        filters
      );

      this.masterfileLines = built.lines;
      this.metaJson = JSON.stringify(built.meta, null, 2);

      const s = built.meta.stats;
      const pubs = s.publications ?? s.publications ?? rows.length;
      let overview = `${pubs} publications \u2022 ${s.distinctCoauthorsInSet} coauthors
        avg set-strength ${s.avgCoauthorStrengthInSet_overall.toFixed(2)} \u2022 avg global-strength ${s.avgCoauthorStrengthGlobal_overall.toFixed(2)}`;

      let typeBreakdown = Object.entries(s.byType || {})
        .map(([type, count]) => `${count} ${type.toLowerCase()}`)
        .join(' \u2022 ');
      if (!typeBreakdown) typeBreakdown = 'no type info';

      this.statsSummary = overview + '\n' + typeBreakdown;
    } finally {
      this.loading = false;
    }
  }

  downloadMeta() {
    const blob = new Blob([this.metaJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const mainAuthor = this.authorName.replace(/\s+/g, '_').replace(/&/g, '');
    a.href = url;
    a.download = `${mainAuthor}.meta.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async confirmPid() {
    if (!this.authorPid) return;
    try {
      const { pid, name } = await firstValueFrom(this.dblpService.findAuthorByPid(this.authorPid));
      this.authorPid = pid;
      this.authorName = name;
      this.suggestions = [];
    } catch (err) {
      console.error('PID lookup failed', err);
      this.authorName = '(Lookup failed)';
    }
  }

  nextPrefix(): string {
    const n = Math.max(1, Math.floor(this.massMode.seq || 1));
    return String(n).padStart(3, '0');
  }

  private canonicalMasterName(): string {
    const safePid = (this.authorPid || 'unknown').replace(/\//g, '-');
    const ts = (this.massMode.testsetId || '').trim();
    if (ts) return `${ts}_${safePid}.master`;
    const mainAuthor = (this.authorName || 'author').replace(/\s+/g, '_').replace(/&/g, '');
    return `${mainAuthor}.master`;
  }

  previewMasterFilename(): string {
    const base = this.canonicalMasterName();
    return (this.massMode.enabled && this.massMode.testsetId)
      ? `${this.nextPrefix()}_${base}`
      : base;
  }

  // CSV controls
  downloadCsvIndex() {
    if (!this.massMode.testsetId) return;
    this.csvIndex.download(this.massMode.testsetId);
  }
  resetCsvIndex() {
    if (!this.massMode.testsetId) return;
    this.csvIndex.clear(this.massMode.testsetId);
  }
}
