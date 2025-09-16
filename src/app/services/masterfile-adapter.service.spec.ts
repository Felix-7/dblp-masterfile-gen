import { TestBed } from '@angular/core/testing';

import { MasterfileAdapterService } from './masterfile-adapter.service';

describe('MasterfileAdapterService', () => {
  let service: MasterfileAdapterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MasterfileAdapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
