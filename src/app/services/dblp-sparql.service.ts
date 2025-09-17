import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {map, Observable} from 'rxjs';

export interface DblpFilters {
  protagonistPid: string;
  types: Array<'Article'|'Inproceedings'|'Incollection'|'Informal'|'Book'|'Data'|'Editorship'|'Reference'>;
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
  avgCoauthorStrength: number;
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

    const venueClause = f.venueSuffix
      ? `?pub dblp:publishedInStream <https://dblp.org/streams/${f.venueSuffix}> .`
      : '';

    const yearClauses = [
      typeof f.yearMin === 'number' ? `FILTER(?year >= "${f.yearMin}"^^xsd:gYear)` : '',
      typeof f.yearMax === 'number' ? `FILTER(?year <= "${f.yearMax}"^^xsd:gYear)` : ''
    ].filter(Boolean).join('\n  ');

    const minPubs = Math.max(0, f.minAuthorPubs ?? 0);
    const protagonistIri = `https://dblp.org/pid/${f.protagonistPid}`;

    // Optional top-K focus: we compute per-author pubs in the set and then filter.
    const topK = f.focusTopAuthors ?? 0;
    const focusBlock = topK > 0 ? `
    {
      SELECT ?keepCo (COUNT(DISTINCT ?joint) AS ?jointPubs)
      WHERE {
        BIND(<${protagonistIri}> AS ?p)
        ?joint a ?type2 ; dblp:hasSignature ?sp, ?sa .
        VALUES ?type2 { ${types} }
        ${venueClause}
        ?joint dblp:yearOfPublication ?y2 .
        ${typeof f.yearMin === 'number' ? `FILTER(?y2 >= "${f.yearMin}"^^xsd:gYear)` : ''}
        ${typeof f.yearMax === 'number' ? `FILTER(?y2 <= "${f.yearMax}"^^xsd:gYear)` : ''}
        ?sp dblp:signatureCreator ?p .
        ?sa dblp:signatureCreator ?keepCo .
        FILTER(?keepCo != ?p)
      }
      GROUP BY ?keepCo
      ${minPubs > 0 ? `HAVING (COUNT(DISTINCT ?joint) >= ${minPubs})` : ''}
      ORDER BY DESC(?jointPubs)
      LIMIT ${topK}
    }
    ` : '';


    return `
      PREFIX dblp: <https://dblp.org/rdf/schema#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?pub ?title ?year ?type
             (GROUP_CONCAT(DISTINCT ?coName; separator="|") AS ?coauthors)
             (GROUP_CONCAT(DISTINCT STR(?co); separator="|") AS ?coIds)
             (COUNT(DISTINCT ?co) AS ?coCount)
             (AVG(?pairStrength) AS ?avgCoauthorStrength)
      WHERE {

        BIND(<${protagonistIri}> AS ?p)

        ?pub a ?type ;
             dblp:hasSignature ?sigP ;
             dblp:title ?title ;
             dblp:yearOfPublication ?year .
        ?sigP dblp:signatureCreator ?p .
        VALUES ?type { ${types} }
        ${venueClause}
        ${yearClauses}

        # coauthors on this pub

        ?pub dblp:hasSignature ?sigA .
        ?sigA dblp:signatureCreator ?co .
        FILTER(?co != ?p)
        ?co dblp:primaryCreatorName ?coName .

        # pair strength within filtered set

        {
          SELECT ?co (COUNT(DISTINCT ?joint) AS ?pairStrength) WHERE {
            BIND(<${protagonistIri}> AS ?p)
            ?joint a ?type2 ; dblp:hasSignature ?sp, ?sa .
            VALUES ?type2 { ${types} }
            ${venueClause}
            ?joint dblp:yearOfPublication ?y2 .
            ${typeof f.yearMin === 'number' ? `FILTER(?y2 >= "${f.yearMin}"^^xsd:gYear)` : ''}
            ${typeof f.yearMax === 'number' ? `FILTER(?y2 <= "${f.yearMax}"^^xsd:gYear)` : ''}
            ?sp dblp:signatureCreator ?p .
            ?sa dblp:signatureCreator ?co .
            FILTER(?co != ?p)
          }
          GROUP BY ?co
        }

        # filter coauthors by min pubs in selected set (WITH protagonist)

        ${minPubs > 0 ? `
        {
          SELECT ?a WHERE {
            BIND(<${protagonistIri}> AS ?p)
            ?pInSet a ?type2 ; dblp:hasSignature ?sp, ?sa .
            VALUES ?type2 { ${types} }
            ${venueClause}
            ?pInSet dblp:yearOfPublication ?y2 .
            ?sp dblp:signatureCreator ?p .
            ?sa dblp:signatureCreator ?a .
            FILTER(?a != ?p)
            ${yearClauses.replace(/\?year/g, '?y2')}
          } GROUP BY ?a HAVING (COUNT(DISTINCT ?pInSet) >= ${minPubs})
        }
        FILTER(?co = ?a)
        ` : ''}

        # optional focus on top-K coauthors (join with ?keepCo from subquery)

        ${focusBlock}
        ${topK > 0 ? `FILTER(?co = ?keepCo)` : '' }
      }

      GROUP BY ?pub ?title ?year ?type
      ORDER BY DESC(?year)
      `;
  }

  runQuery(query: string): Observable<SparqlPubRow[]> {
    const params = new HttpParams()
      .set('format', 'json')
      .set('query', query);

    const headers = new HttpHeaders({
      'Accept': 'application/sparql-results+json'
    });

    return this.http.get<any>(this.endpoint, { params, headers }).pipe(
      map(res => {
        const rows = res?.results?.bindings ?? [];
        return rows.map((b: any) => ({
          pub: b.pub.value,
          title: b.title?.value ?? '',
          year: Number(b.year?.value ?? 0),
          type: b.type?.value?.replace('https://dblp.org/rdf/schema#','') ?? '',
          coauthors: b.coauthors?.value ?? '',
          coauthorIds: b.coIds?.value ?? '',
          coCount: Number(b.coCount?.value ?? 0),
          avgCoauthorStrength: Number(b.avgCoauthorStrength?.value ?? 0)
        }));
      })
    );
  }
}
