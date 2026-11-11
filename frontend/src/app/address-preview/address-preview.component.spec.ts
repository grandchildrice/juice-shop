/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { AddressPreviewComponent } from './address-preview.component'

describe('AddressPreviewComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AddressPreviewComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ addressId: '42' }) } } }
      ]
    })
  })

  afterEach(() => TestBed.inject(HttpTestingController).verify())

  it('renders the saved address returned by the preview endpoint', () => {
    const fixture = TestBed.createComponent(AddressPreviewComponent)
    fixture.detectChanges()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/address/42/preview')
      .flush({ data: { fullName: 'Address Owner', streetAddress: '10 Demo Street', city: 'Test City' } })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('#addressPreview').textContent).toContain('10 Demo Street')
  })

  it('displays an ownership denial without rendering an address', () => {
    const fixture = TestBed.createComponent(AddressPreviewComponent)
    fixture.detectChanges()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/address/42/preview')
      .flush({ error: 'Another customer' }, { status: 403, statusText: 'Forbidden' })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Another customer')
    expect(fixture.nativeElement.querySelector('#addressPreview')).toBeNull()
  })
})
