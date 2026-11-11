/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map } from 'rxjs/operators'
import { environment } from '../../environments/environment'

export interface Recipe {
  id: number
  name: string
  deluxe: boolean
  ingredients: string | null
  instructions: string | null
}

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly http = inject(HttpClient)

  search (query: string, includeInstructions?: boolean) {
    const params: { query: string, includeInstructions?: boolean } = { query }
    if (includeInstructions !== undefined) params.includeInstructions = includeInstructions
    return this.http.post<{ data: Recipe[] }>(`${environment.hostServer}/rest/recipes/search`, params).pipe(map(response => response.data))
  }
}
