/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { MailboxComponent } from './mailbox.component'

describe('MailboxComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MailboxComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
  })

  afterEach(() => TestBed.inject(HttpTestingController).verify())

  it('displays the current account mailbox and code returned by the server', () => {
    const fixture = TestBed.createComponent(MailboxComponent)
    fixture.detectChanges()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/mailbox').flush({
      data: { email: 'owner@example.test', messages: [{ id: 'request-1', code: '123456', expiresAt: Date.now() + 300000 }] }
    })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('#mailboxOwner').textContent).toContain('owner@example.test')
    expect(fixture.nativeElement.querySelector('.login-code').textContent).toContain('123456')
  })

  it('shows authentication errors without exposing a mailbox', () => {
    const fixture = TestBed.createComponent(MailboxComponent)
    fixture.detectChanges()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/mailbox')
      .flush({ error: 'Please log in' }, { status: 401, statusText: 'Unauthorized' })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Please log in')
    expect(fixture.nativeElement.querySelector('.login-code')).toBeNull()
  })
})
