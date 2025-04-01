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

    for (let i = 0; i < rNodes.length; i++) {
      const r = rNodes[i];
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

          for (let j = 0; j < authorElements.length; j++) {
            const authorElem = authorElements[j];
            const fullName = authorElem.textContent?.trim() || '';
            // Use the pid attribute if available; otherwise, fallback to the full name as dblp states that
            // pid might be incomplete?? TODO Double-Check if I understood that correctly
            const id = authorElem.getAttribute('pid') || fullName;
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

    // Generate line for each publication
    publications.forEach((pub, index) => {
      const timestamp = `t${(index + 1).toString().padStart(2, '0')}`;
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
      const line = `${timestamp} : ${present.join(',')}` +
        (missing.length > 0 ? `;${missing.join(';')}` : '') +
        ` : ${allAuthors.join(',')}`;
      lines.push(line);
    });
    return lines;
  }

  // TODO Handle cases where two individuals have the same initials.
  private generateAbbreviation(fullName: string): string {
    return fullName.split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  }
}
