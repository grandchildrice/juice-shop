/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter, Router } from '@angular/router'
import { CookieService } from 'ngy-cookie'
import { of, Subject } from 'rxjs'
import { EmailLoginComponent } from './email-login.component'
import { BasketService } from '../Services/basket.service'
import { UserService } from '../Services/user.service'

describe('EmailLoginComponent', () => {
  const basket = { mergeGuestBasketIntoUserBasket: vi.fn(() => of(void 0)), updateNumberOfCartItems: vi.fn() }
  const cookies = { put: vi.fn() }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EmailLoginComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: BasketService, useValue: basket },
        { provide: UserService, useValue: { isLoggedIn: new Subject<boolean>() } },
        { provide: CookieService, useValue: cookies }
      ]
    })
  })

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify()
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('requests a code for the entered account and displays the verification form', async () => {
    const fixture = TestBed.createComponent(EmailLoginComponent)
    fixture.componentInstance.email = 'customer@example.test'
    const pending = fixture.componentInstance.requestCode()
    const req = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/user/email-login/request')
    expect(req.request.body).toEqual({ email: 'customer@example.test', sendTo: 'customer@example.test', codeChannel: 'EMAIL' })
    req.flush({ data: { requestId: 'request-1' } })
    await pending
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('#otpCode')).toBeTruthy()
  })

  it('keeps the verification form and displays a rejected code without signing in', async () => {
    const fixture = TestBed.createComponent(EmailLoginComponent)
    fixture.componentInstance.requestId.set('request-1')
    fixture.componentInstance.code = '000000'
    const pending = fixture.componentInstance.verifyCode()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/user/email-login/verify')
      .flush({ error: 'Invalid code' }, { status: 401, statusText: 'Unauthorized' })
    await pending
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Invalid code')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('establishes the returned account session and navigates to the catalog', async () => {
    const fixture = TestBed.createComponent(EmailLoginComponent)
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    fixture.componentInstance.requestId.set('request-1')
    fixture.componentInstance.code = '123456'
    const pending = fixture.componentInstance.verifyCode()
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/rest/user/email-login/verify')
      .flush({ authentication: { token: 'new-session', bid: 42, umail: 'customer@example.test' } })
    await pending
    expect(localStorage.getItem('token')).toBe('new-session')
    expect(sessionStorage.getItem('bid')).toBe('42')
    expect(cookies.put).toHaveBeenCalledWith('token', 'new-session')
    expect(basket.mergeGuestBasketIntoUserBasket).toHaveBeenCalledWith(42)
    expect(navigate).toHaveBeenCalledWith(['/search'])
  })
})
