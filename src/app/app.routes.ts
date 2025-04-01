import {RouterModule, Routes} from '@angular/router';
import {AuthorSearchComponent} from './components/author-search/author-search.component';
import {NgModule} from '@angular/core';

export const routes: Routes = [
  { path: '', component: AuthorSearchComponent },
  { path: 'author-search', component: AuthorSearchComponent }
];
