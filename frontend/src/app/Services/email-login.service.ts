/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map } from 'rxjs/operators'
import { environment } from '../../environments/environment'

export interface Mailbox {
  email: string
  messages: { id: string, code: string, expiresAt: number }[]
}

@Injectable({ providedIn: 'root' })
export class EmailLoginService {
  private readonly http = inject(HttpClient)
  private readonly host = environment.hostServer

  requestCode (email: string) {
    return this.http.post<{ data: { requestId: string } }>(`${this.host}/rest/user/email-login/request`, {
      email, sendTo: email, codeChannel: 'EMAIL'
    }).pipe(map(response => response.data))
  }

  verifyCode (requestId: string, code: string) {
    return this.http.post<{ authentication: { token: string, bid: number, umail: string } }>(`${this.host}/rest/user/email-login/verify`, {
      requestId, code
    }).pipe(map(response => response.authentication))
  }

  inbox () {
    return this.http.get<{ data: Mailbox }>(`${this.host}/rest/mailbox`).pipe(map(response => response.data))
  }
}
