import { Component } from '@angular/core';
import { DblpService } from '../../services/dblp.service';
import { MasterfileGeneratorService } from '../../services/masterfile-generator.service';
import { FormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';
import {MasterfileAdapterService} from '../../services/masterfile-adapter.service';
import {DblpFilters, DblpSparqlService} from '../../services/dblp-sparql.service';
import {firstValueFrom} from 'rxjs';

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

  constructor(
    private readonly dblpService: DblpService,
    private readonly masterfileService: MasterfileGeneratorService,
    private readonly sparql: DblpSparqlService,
    private readonly mfAdapter: MasterfileAdapterService
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
    const blob = new Blob([this.masterfileLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const mainAuthor = this.authorName.replace(/\s+/g, '_').replace(/&/g, '');
    a.download = `${mainAuthor}.master`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private selectedTypes(): DblpFilters['types'] {
    return (Object.keys(this.types) as Array<keyof typeof this.types>)
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
        venueSuffix: this.venueSuffix || undefined,
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
      let line1 = `${s.papers} papers \u2022 ${s.distinctCoauthors} coauthors \u2022 avg strength ${s.avgCoauthorStrength_overall.toFixed(2)}`;

      let typeBreakdown = Object.entries(s.byType)
        .map(([type, count]) => `${count} ${type.toLowerCase()}`)
        .join(' \u2022 ');
      if (!typeBreakdown) typeBreakdown = 'no type info';

      this.statsSummary = line1 + '\n' + typeBreakdown;
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
}
