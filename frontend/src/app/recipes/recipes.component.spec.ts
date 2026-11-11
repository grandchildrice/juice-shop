/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { RecipesComponent } from './recipes.component'

describe('RecipesComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RecipesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    })
  })

  afterEach(() => TestBed.inject(HttpTestingController).verify())

  it('omits the reveal flag during normal search and shows the membership requirement', () => {
    const fixture = TestBed.createComponent(RecipesComponent)
    fixture.detectChanges()
    const req = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/recipes/search')
    expect(req.request.body).toEqual({ query: '' })
    req.flush({ data: [{ id: 2, name: 'Deluxe blend', deluxe: true, ingredients: null, instructions: null }] })
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('available to Deluxe members')
    expect(fixture.nativeElement.querySelector('.recipe-instructions')).toBeNull()
  })

  it('renders revealed recipe instructions returned by the server', () => {
    const fixture = TestBed.createComponent(RecipesComponent)
    fixture.detectChanges()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/recipes/search').flush({
      data: [{ id: 2, name: 'Deluxe blend', deluxe: true, ingredients: 'Apple juice', instructions: 'Stir and serve chilled.' }]
    })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.recipe-instructions').textContent).toContain('serve chilled')
  })
})
