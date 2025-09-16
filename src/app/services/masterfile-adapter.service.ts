import { Injectable } from '@angular/core';
import {SparqlPubRow} from './dblp-sparql.service';
import {MasterfileGeneratorService} from './masterfile-generator.service';

export interface MasterfileBuild {
  lines: string[];
  meta: {
    generatedAt: string;
    protagonist: { id: string; name: string };
    filters: Record<string, any>;
    stats: {
      papers: number;
      avgCoauthorStrength_overall: number;
      byType: Record<string, number>;
      distinctCoauthors: number;
    };
    perPaper: Array<{
      pub: string;
      year: number;
      type: string;
      coCount: number;
      avgCoauthorStrength: number;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MasterfileAdapterService {

  toMasterfile(generator: MasterfileGeneratorService,
               sparqlRows: SparqlPubRow[],
               protagonist: { id: string; name: string },
               filters: Record<string, any>): MasterfileBuild {

    // Map SPARQL rows to old intermediate shape (authors per pub).

    const pubs = sparqlRows.map(r => {
      const names = r.coauthors ? r.coauthors.split('|') : [];
      const ids = r.coauthorIds ? r.coauthorIds.split('|') : [];
      const co = names.map((name, i) => {
        const iri = ids[i] ?? name;
        const pid = iri.replace('https://dblp.org/pid/', '');
        return { id: pid, name };
      });
      const authors = [{ id: protagonist.id, name: protagonist.name }, ...co];
      return { year: r.year, authors };
    })

    const distinctCoauthors = new Set<string>();
    sparqlRows.forEach(r => {
      const ids = r.coauthorIds ? r.coauthorIds.split('|') : [];
      ids.forEach(id => distinctCoauthors.add(id));
    });

    const meta = {
      generatedAt: new Date().toISOString(),
      protagonist,
      filters,
      stats: {
        papers: sparqlRows.length,
        avgCoauthorStrength_overall: average(sparqlRows.map(r => r.avgCoauthorStrength)),
        byType: groupCount(sparqlRows, r => r.type),
        distinctCoauthors: distinctCoauthors.size
      },
      perPaper: sparqlRows.map(r => ({
        pub: r.pub,
        year: r.year,
        type: r.type,
        coCount: r.coCount,
        avgCoauthorStrength: r.avgCoauthorStrength
      }))
    };

    const lines = generator.generateMasterfileLines(pubs, protagonist.id, meta);

    return { lines, meta };
  }
}

function average(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a,b)=>a+b,0)/xs.length;
}
function groupCount<T>(rows: T[], key: (r:T)=>string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Object.fromEntries(m.entries());
}
