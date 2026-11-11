/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response } from 'express'
import recipes from '../data/static/recipes.json'
import { challenges } from '../data/datacache'
import * as security from '../lib/insecurity'
import * as challengeUtils from '../lib/challengeUtils'

export function searchRecipes () {
  return (req: Request, res: Response) => {
    const { query = '', includeInstructions = false } = req.body
    if (typeof query !== 'string' || typeof includeInstructions !== 'boolean') {
      res.status(400).json({ error: 'Invalid recipe search.' })
      return
    }
    const session = security.authenticatedUsers.from(req)
    if (!session) {
      res.status(401).json({ error: 'Please log in to search recipes.' })
      return
    }
    const deluxe = session.data.role === security.roles.deluxe
    const data = recipes.filter(recipe => recipe.name.toLowerCase().includes(query.toLowerCase())).map(recipe => {
      const unlocked = !recipe.deluxe || deluxe || includeInstructions
      challengeUtils.solveIf(challenges.recipePaywallChallenge, () => recipe.deluxe && !deluxe && includeInstructions)
      return {
        id: recipe.id,
        name: recipe.name,
        deluxe: recipe.deluxe,
        ingredients: unlocked ? recipe.ingredients : null,
        instructions: unlocked ? recipe.instructions : null
      }
    })
    res.json({ status: 'success', data })
  }
}
