import { Injectable } from '@angular/core';
import {map, Observable} from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class DblpService {

  constructor(private http: HttpClient) { }

  findAuthor(name: string): Observable<any> {
    const query = name.replace(/\s+/g, '+').replace(/&/g, '');
    const url = `https://dblp.org/search/author/api?q=${query}&format=json&h=1000`;
    return this.http.get<any>(url);
  }

  findAuthorByPid(authorPid: string): Observable<{ pid: string; name: string }> {
    const pid = this.normalizePid(authorPid);
    const url = `https://dblp.org/pid/${pid}.xml`;

    return this.http.get(url, { responseType: 'text' }).pipe(
      map(xml => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');

        // basic XML parse error check
        if (doc.getElementsByTagName('parsererror').length) {
          throw new Error('DBLP XML parse error');
        }

        // expected root: <dblpperson name="...">...</dblpperson>
        const root = doc.querySelector('dblpperson');
        if (!root) throw new Error('dblpperson element not found');

        const name = root.getAttribute('name') ?? '';
        if (!name) throw new Error('Person name not found in XML');

        return { pid, name };
      })
    );
  }

  private normalizePid(input: string): string {
    return input.trim()
      .replace(/^https?:\/\/dblp\.org\/pid\//i, '')
      .replace(/^\/?pid\//i, '')
      .replace(/\.html?$/i, '')
      .replace(/\.xml$/i, '');
  }
}
