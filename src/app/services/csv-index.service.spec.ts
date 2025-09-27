import { TestBed } from '@angular/core/testing';

import { CsvIndexService } from './csv-index.service';

describe('CsvIndexService', () => {
  let service: CsvIndexService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CsvIndexService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
