import { Component } from '@angular/core';
import { DblpService } from '../../services/dblp.service';
import { MasterfileGeneratorService } from '../../services/masterfile-generator.service';
import { FormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';

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
  suggestions: any[] = [];
  masterfileLines: string[] = [];

  constructor(
    private dblpService: DblpService,
    private masterfileService: MasterfileGeneratorService
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

  // When an author is selected, load the publications, parse them and generate the master file lines
  selectAuthor(suggestion: any) {
    const authorId = suggestion.author.id;
    this.dblpService.loadPublications(authorId).subscribe(rawXml => {
      const publications = this.masterfileService.parsePublications(rawXml);
      this.masterfileLines = this.masterfileService.generateMasterfileLines(publications, authorId);
    });
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
}
