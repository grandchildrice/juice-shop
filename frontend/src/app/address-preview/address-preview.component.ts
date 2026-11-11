/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, type OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { AddressService } from '../Services/address.service'

@Component({
  selector: 'app-address-preview',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './address-preview.component.html',
  styleUrls: ['./address-preview.component.scss'],
  imports: [MatCardModule]
})
export class AddressPreviewComponent implements OnInit {
  private readonly addressService = inject(AddressService)
  private readonly route = inject(ActivatedRoute)
  public readonly address = signal<any>(null)
  public readonly error = signal('')

  ngOnInit () {
    this.addressService.preview(this.route.snapshot.paramMap.get('addressId')).subscribe({
      next: address => this.address.set(address),
      error: err => this.error.set(err.error?.error ?? 'Unable to preview this address.')
    })
  }
}
