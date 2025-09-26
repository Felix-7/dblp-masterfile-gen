import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MasterfileGeneratorService {
  // Dictionary for master author information.
  private masterAuthors: { [id: string]: { abbreviation: string, fullName: string } } = {};

  constructor() {}

  generateMasterfileLines(publications: any[], mainAuthorId: string, meta?: any): string[] {

    const lines: string[] = [];
    this.masterAuthors = {};

    // Build master authors list from all publications
    for (const pub of publications) {
      for (const author of pub.authors) {
        if (!this.masterAuthors[author.id]) {
          const abbr = this.generateAbbreviation(author.name);
          this.masterAuthors[author.id] = { abbreviation: abbr, fullName: author.name };
        }
      }
    }

    // Set main author to the top of the list
    if (this.masterAuthors[mainAuthorId]) {
      const protagonist = this.masterAuthors[mainAuthorId];
      delete this.masterAuthors[mainAuthorId];
      this.masterAuthors = { [mainAuthorId]: protagonist, ...this.masterAuthors };
    } else {
      console.error(`Main author ID ${mainAuthorId} not found in master authors.`);
      return lines;
    }

    const masterOrder = Object.keys(this.masterAuthors);
    const allAuthors = masterOrder.map(id => this.masterAuthors[id].abbreviation);

    // Build publication lines

    publications.sort((a, b) => a.year - b.year);

    publications.forEach((pub) => {
      // Timestamp is based on the publication year.
      const timestamp = `t${pub.year}`;
      // Build the list of present authors for this publication (using their abbreviation).
      let present: string[] = [];
      pub.authors.forEach((author: any) => {
        if (this.masterAuthors[author.id]) {
          present.push(this.masterAuthors[author.id].abbreviation);
        }
      });
      // Remove duplicates (TODO this is a fix because abbreviations might be non-unique).
      present = Array.from(new Set(present));

      const missing = masterOrder.filter(id => {
        const abbr = this.masterAuthors[id].abbreviation;
        return present.indexOf(abbr) === -1;
      }).map(id => this.masterAuthors[id].abbreviation);

      // Format: timestamp : <present>; <missing> : <allAuthors>
      const pubLine = `${timestamp} : ${present.join(',')}` +
        (missing.length > 0 ? `;${missing.join(';')}` : '') +
        ` : ${allAuthors.join(',')}`;
      lines.push(pubLine);
    });

    // Build header

    const headerLines: string[] = [];

    headerLines.push(`* Generated using the DBLP Master-Generator inspired by Tim Hegemann`);
    const mainAuthorName = this.masterAuthors[mainAuthorId].fullName;
    headerLines.push(`* Main Author: ${mainAuthorName}`);

    if (meta) {
      headerLines.push(`* Generated at: ${meta.generatedAt}`);
      headerLines.push(`* Filters: ${JSON.stringify(meta.filters)}`);
      headerLines.push(`* Papers: ${meta.stats.papers}, Distinct coauthors: ${meta.stats.distinctCoauthors}`);
      headerLines.push(`* Avg coauthor strength in set: ${meta.stats.avgCoauthorStrengthInSet_overall.toFixed(2)}`);
      headerLines.push(`* Avg coauthor strength global: ${meta.stats.avgCoauthorStrengthGlobal_overall.toFixed(2)}`);
      headerLines.push(`* Breakdown: ${Object.entries(meta.stats.byType).map(([t,c]) => `${c} ${t}`).join(', ')}`);
    }

    masterOrder.forEach(id => {
      const { abbreviation, fullName } = this.masterAuthors[id];
      headerLines.push(`${abbreviation} ${fullName}`);
    });
    headerLines.push('');

    const protagonistAbbr = this.masterAuthors[mainAuthorId].abbreviation;
    headerLines.push(`${protagonistAbbr} Protagonist`);
    headerLines.push('');

    return [...headerLines, ...lines];
  }

  private generateAbbreviation(fullName: string): string {
    // Base abbreviation is the first letter of each word in the full name, capitalized
    const base = fullName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('');

    // If the base abbreviation is not already taken, return it
    const existingAbbrs = new Set(
      Object.values(this.masterAuthors).map(a => a.abbreviation)
    );
    if (!existingAbbrs.has(base)) {
      return base;
    }

    // If the base abbreviation is taken, append a number to it
    let suffix = 1;
    let attempt = `${base}${suffix}`;
    while (existingAbbrs.has(attempt)) {
      suffix += 1;
      attempt = `${base}${suffix}`;
    }
    return attempt;
  }
}
