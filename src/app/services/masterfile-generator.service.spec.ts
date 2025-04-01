import { TestBed } from '@angular/core/testing';

import { MasterfileGeneratorService } from './masterfile-generator.service';

describe('MasterfileGeneratorService', () => {
  let service: MasterfileGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MasterfileGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
