/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { CookieService } from 'ngy-cookie'
import { catchError, firstValueFrom, of } from 'rxjs'
import { EmailLoginService } from '../Services/email-login.service'
import { BasketService } from '../Services/basket.service'
import { UserService } from '../Services/user.service'

@Component({
  selector: 'app-email-login',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './email-login.component.html',
  styleUrls: ['./email-login.component.scss'],
  imports: [FormsModule, RouterLink, MatCardModule, MatButtonModule, MatInputModule]
})
export class EmailLoginComponent {
  private readonly emailLoginService = inject(EmailLoginService)
  private readonly basketService = inject(BasketService)
  private readonly userService = inject(UserService)
  private readonly cookieService = inject(CookieService)
  private readonly router = inject(Router)

  public email = ''
  public code = ''
  public readonly requestId = signal('')
  public readonly error = signal('')
  public readonly busy = signal(false)

  async requestCode () {
    this.error.set('')
    this.busy.set(true)
    try {
      const data = await firstValueFrom(this.emailLoginService.requestCode(this.email))
      this.requestId.set(data.requestId)
      this.code = ''
    } catch (err: any) {
      this.error.set(err.error?.error ?? 'Unable to send a sign-in code.')
    } finally {
      this.busy.set(false)
    }
  }

  async verifyCode () {
    this.error.set('')
    this.busy.set(true)
    try {
      const authentication = await firstValueFrom(this.emailLoginService.verifyCode(this.requestId(), this.code))
      localStorage.setItem('token', authentication.token)
      this.cookieService.put('token', authentication.token)
      sessionStorage.setItem('bid', String(authentication.bid))
      await firstValueFrom(this.basketService.mergeGuestBasketIntoUserBasket(authentication.bid).pipe(catchError(() => of(void 0))))
      this.basketService.updateNumberOfCartItems()
      this.userService.isLoggedIn.next(true)
      await this.router.navigate(['/search'])
    } catch (err: any) {
      this.error.set(err.error?.error ?? 'Unable to sign in.')
    } finally {
      this.busy.set(false)
    }
  }
}
