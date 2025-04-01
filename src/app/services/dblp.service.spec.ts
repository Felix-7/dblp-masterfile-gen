import { TestBed } from '@angular/core/testing';

import { DblpService } from './dblp.service';

describe('DblpService', () => {
  let service: DblpService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DblpService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
