/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { Component, type OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { RecipeService, type Recipe } from '../Services/recipe.service'

@Component({
  selector: 'app-recipes',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './recipes.component.html',
  styleUrls: ['./recipes.component.scss'],
  imports: [FormsModule, RouterLink, MatCardModule, MatButtonModule, MatInputModule]
})
export class RecipesComponent implements OnInit {
  private readonly recipeService = inject(RecipeService)
  public query = ''
  public readonly recipes = signal<Recipe[]>([])
  public readonly error = signal('')

  ngOnInit () {
    this.search()
  }

  search () {
    this.error.set('')
    this.recipeService.search(this.query).subscribe({
      next: recipes => this.recipes.set(recipes),
      error: err => this.error.set(err.error?.error ?? 'Unable to search recipes.')
    })
  }
}
