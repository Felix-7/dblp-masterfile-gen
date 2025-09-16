import { TestBed } from '@angular/core/testing';

import { DblpSparqlService } from './dblp-sparql.service';

describe('DblpSparqlService', () => {
  let service: DblpSparqlService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DblpSparqlService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
