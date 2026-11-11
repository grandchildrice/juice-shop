/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, type OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { DatePipe } from '@angular/common'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { EmailLoginService, type Mailbox } from '../Services/email-login.service'

@Component({
  selector: 'app-mailbox',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './mailbox.component.html',
  styleUrls: ['./mailbox.component.scss'],
  imports: [DatePipe, MatCardModule, MatButtonModule]
})
export class MailboxComponent implements OnInit {
  private readonly emailLoginService = inject(EmailLoginService)
  public readonly mailbox = signal<Mailbox | null>(null)
  public readonly error = signal('')

  ngOnInit () {
    this.load()
  }

  load () {
    this.error.set('')
    this.emailLoginService.inbox().subscribe({
      next: mailbox => this.mailbox.set(mailbox),
      error: err => this.error.set(err.error?.error ?? 'Unable to load your mailbox.')
    })
  }
}
