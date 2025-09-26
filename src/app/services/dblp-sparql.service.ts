import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {map, Observable} from 'rxjs';

export interface DblpFilters {
  protagonistPid: string;
  types: Array<'Article'|'Inproceedings'|'Incollection'|'Informal'|'Book'|'Data'|'Editorship'|'Reference'|'Withdrawn'>;
  venueSuffix?: string;
  minAuthorPubs?: number;
  focusTopAuthors?: number;
  yearMin?: number;
  yearMax?: number;
}

export interface SparqlPubRow {
  pub: string;
  title: string;
  year: number;
  type: string;
  coauthors: string; // Format is "Name1|Name2|..."
  coauthorIds: string;
  coCount: number;

  avgCoauthorStrengthInSet: number;
  minCoauthorStrengthInSet: number;
  maxCoauthorStrengthInSet: number;

  avgCoauthorStrengthGlobal: number;
  minCoauthorStrengthGlobal: number;
  maxCoauthorStrengthGlobal: number;
}

@Injectable({
  providedIn: 'root'
})
export class DblpSparqlService {
  private readonly endpoint = 'https://sparql.dblp.org/sparql';

  constructor(private readonly http: HttpClient) {}

  buildQuery(f: DblpFilters): string {
    const types = (f.types?.length ? f.types : ['Article','Inproceedings'])
      .map(t => `dblp:${t}`).join(' ');

    // year filters (paper)
    const yearMain = [
      typeof f.yearMin === 'number' ? `FILTER(?year >= "${f.yearMin}"^^xsd:gYear)` : '',
      typeof f.yearMax === 'number' ? `FILTER(?year <= "${f.yearMax}"^^xsd:gYear)` : ''
    ].filter(Boolean).join('\n        ');

    // year filters (subqueries use ?y2)
    const yearY2 = [
      typeof f.yearMin === 'number' ? `FILTER(?y2 >= "${f.yearMin}"^^xsd:gYear)` : '',
      typeof f.yearMax === 'number' ? `FILTER(?y2 <= "${f.yearMax}"^^xsd:gYear)` : ''
    ].filter(Boolean).join('\n          ');

    const minPubs = Math.max(0, f.minAuthorPubs ?? 0);
    const topK = Math.max(0, f.focusTopAuthors ?? 0);
    const pIri = `https://dblp.org/pid/${f.protagonistPid}`;

    // optional focus on top-K coauthors in the filtered set (based on PS_SET)
    const topKBlock = topK > 0 ? `
        {
          SELECT ?keepCo (COUNT(DISTINCT ?jointTK) AS ?ps_set_tk)
          WHERE {
            BIND(<${pIri}> AS ?p)
            ?jointTK a ?typeTK ; dblp:hasSignature ?spTK, ?saTK .
            VALUES ?typeTK { ${types} }
            ${this.venueClauseFor('?jointTK', f.venueSuffix)}
            ?jointTK dblp:yearOfPublication ?y2 .
            ${yearY2}
            ?spTK dblp:signatureCreator ?p .
            ?saTK dblp:signatureCreator ?keepCo .
            FILTER(?keepCo != ?p)
          }
          GROUP BY ?keepCo
          ORDER BY DESC(?ps_set_tk)
          LIMIT ${topK}
        }
    ` : '';

    const minPubsFilter = minPubs > 0 ? `FILTER(?ps_set >= ${minPubs})` : '';
    const topKFilter = topK > 0 ? `FILTER(?co = ?keepCo)` : '';

    return `
      PREFIX dblp: <https://dblp.org/rdf/schema#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT
        ?pub ?title ?year ?type
        (GROUP_CONCAT(DISTINCT ?coName; separator="|") AS ?coauthors)
        (GROUP_CONCAT(DISTINCT STR(?co); separator="|") AS ?coIds)
        (COUNT(DISTINCT ?co) AS ?coCount)

        # in-set paper-level stats (only coauthors on this pub)
        (AVG(DISTINCT ?ps_set) AS ?avgCoauthorStrengthInSet)
        (MIN(DISTINCT ?ps_set) AS ?minCoauthorStrengthInSet)
        (MAX(DISTINCT ?ps_set) AS ?maxCoauthorStrengthInSet)

        # global paper-level stats (no filters)
        (AVG(DISTINCT ?ps_all) AS ?avgCoauthorStrengthGlobal)
        (MIN(DISTINCT ?ps_all) AS ?minCoauthorStrengthGlobal)
        (MAX(DISTINCT ?ps_all) AS ?maxCoauthorStrengthGlobal)

      WHERE {

        BIND(<${pIri}> AS ?p)

        # protagonist's publications in the filtered set

        ?pub a ?type ;
             dblp:hasSignature ?sigP ;
             dblp:title ?title ;
             dblp:yearOfPublication ?year .
        ?sigP dblp:signatureCreator ?p .
        VALUES ?type { ${types} }
        ${this.venueClauseFor('?pub', f.venueSuffix)}
        ${yearMain}

        # distinct coauthors per publication
        {
          SELECT DISTINCT ?pub ?co WHERE {
            ?pub dblp:hasSignature ?sigA .
            ?sigA dblp:signatureCreator ?co .
          }
        }
        FILTER(?co != ?p)

        # optional display name
        OPTIONAL { ?co dblp:primaryCreatorName ?coName . }

        # pair strength inside the filtered set (PS_SET)
        {
          SELECT ?co (COUNT(DISTINCT ?joint) AS ?ps_set)
          WHERE {
            BIND(<${pIri}> AS ?p)
            ?joint a ?type2 ; dblp:hasSignature ?sp, ?sa .
            VALUES ?type2 { ${types} }
            ${this.venueClauseFor('?joint', f.venueSuffix)}
            ?joint dblp:yearOfPublication ?y2 .
            ${yearY2}
            ?sp dblp:signatureCreator ?p .
            ?sa dblp:signatureCreator ?co .
            FILTER(?co != ?p)
          }
          GROUP BY ?co
        }

        # pair strength globally across all years/types/venues (PS_ALL)
        {
          SELECT ?co (COUNT(DISTINCT ?joint2) AS ?ps_all)
          WHERE {
            BIND(<${pIri}> AS ?p)
            ?joint2 dblp:hasSignature ?sp2, ?sa2 .
            ?sp2 dblp:signatureCreator ?p .
            ?sa2 dblp:signatureCreator ?co .
            FILTER(?co != ?p)
          }
          GROUP BY ?co
        }

        # optional: minimum pair strength in the filtered set
        ${minPubsFilter}

        # optional: focus on top-K coauthors (by PS_SET)
        ${topKBlock}
        ${topKFilter}
      }

      GROUP BY ?pub ?title ?year ?type
      ORDER BY DESC(?year)
    `;
  }

  runQuery(query: string): Observable<SparqlPubRow[]> {
    const params = new HttpParams().set('format', 'json').set('query', query);
    const headers = new HttpHeaders({ 'Accept': 'application/sparql-results+json' });

    return this.http.get<any>(this.endpoint, { params, headers }).pipe(
      map(res => {
        const rows = res?.results?.bindings ?? [];
        return rows.map((b: any) => ({
          pub: b.pub?.value ?? '',
          title: b.title?.value ?? '',
          year: Number(b.year?.value ?? 0),
          type: (b.type?.value ?? '').replace('https://dblp.org/rdf/schema#',''),

          coauthors: b.coauthors?.value ?? '',
          coauthorIds: b.coIds?.value ?? '',
          coCount: Number(b.coCount?.value ?? 0),

          avgCoauthorStrengthInSet: Number(b.avgCoauthorStrengthInSet?.value ?? 0),
          minCoauthorStrengthInSet: Number(b.minCoauthorStrengthInSet?.value ?? 0),
          maxCoauthorStrengthInSet: Number(b.maxCoauthorStrengthInSet?.value ?? 0),

          avgCoauthorStrengthGlobal: Number(b.avgCoauthorStrengthGlobal?.value ?? 0),
          minCoauthorStrengthGlobal: Number(b.minCoauthorStrengthGlobal?.value ?? 0),
          maxCoauthorStrengthGlobal: Number(b.maxCoauthorStrengthGlobal?.value ?? 0),
        }));
      })
    );
  }

  private venueClauseFor(varName: string, venueSuffix?: string): string {
    return venueSuffix
      ? `${varName} dblp:publishedInStream <https://dblp.org/streams/${venueSuffix}> .`
      : '';
  }
}
