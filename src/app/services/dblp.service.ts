import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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

  loadPublications(id: string): Observable<string> {
    const url = `https://dblp.org/pid/${id}.xml`;
    return this.http.get(url, { responseType: 'text' });
  }
}
