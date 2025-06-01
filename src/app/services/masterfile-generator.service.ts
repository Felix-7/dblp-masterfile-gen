import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MasterfileGeneratorService {
  // Dictionary for master author information.
  private masterAuthors: { [id: string]: { abbreviation: string, fullName: string } } = {};

  constructor() {}

  parsePublications(rawXml: string): any[] {

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawXml, "application/xml");
    const publications: any[] = [];
    const rNodes = xmlDoc.getElementsByTagName('r');

    for (const element of rNodes) {
      const r = element;
      const entry = r.firstElementChild;

      if (entry) {
        const nodeName = entry.nodeName.toLowerCase();
        if (['article', 'inproceedings', 'incollection', 'phdthesis'].includes(nodeName)) {

          const yearElement = entry.getElementsByTagName('year')[0];
          const year = yearElement ? parseInt(yearElement.textContent || '', 10) : NaN;

          if (isNaN(year)) {
            console.warn(`Invalid year found in publication: ${entry.outerHTML}`);
            continue; // Skip if year is not valid
          }

          const authorElements = entry.getElementsByTagName('author');
          const authors: any[] = [];

          for (const element of authorElements) {
            const authorElem = element;
            const fullName = authorElem.textContent?.trim() ?? '';
            // Use the pid attribute if available; otherwise, fallback to the full name as dblp states that
            // pid might be incomplete?? TODO Double-Check if I understood that correctly
            const id = authorElem.getAttribute('pid') ?? fullName;
            authors.push({ id, name: fullName });
          }
          publications.push({ year, authors });
        }
      }
    }
    return publications;
  }

  generateMasterfileLines(publications: any[], mainAuthorId: string): string[] {

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
