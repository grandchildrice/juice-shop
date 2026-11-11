/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Express } from 'express'
import { createTestApp } from './helpers/setup'
import { login } from './helpers/auth'
import { challenges } from '../../data/datacache'
import { UserModel } from '../../models/user'
import { WalletModel } from '../../models/wallet'
import * as security from '../../lib/insecurity'

let app: Express
let token: string
let deluxeToken: string
let userId: number

before(async () => {
  app = (await createTestApp()).app
  token = (await login(app, { email: 'jim@juice-sh.op', password: 'ncc-1701' })).token
  const deluxe = await UserModel.findOne({ where: { role: security.roles.deluxe } })
  deluxeToken = security.authorize({ data: deluxe!.toJSON() })
  security.authenticatedUsers.put(deluxeToken, { data: deluxe!.toJSON() })
  userId = security.authenticatedUsers.get(token)!.data.id
}, { timeout: 60000 })

beforeEach(async () => {
  await challenges.recipePaywallChallenge.update({ solved: false })
})

void describe('Recipe search', () => {
  void it('requires authentication', async () => {
    assert.equal((await request(app).post('/rest/recipes/search').send({})).status, 401)
  })

  void it('returns free instructions and masks Deluxe recipes for ordinary customers', async () => {
    const res = await request(app).post('/rest/recipes/search').set('Authorization', `Bearer ${token}`).send({ query: '' })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.find((recipe: any) => !recipe.deluxe).instructions)
    const premium = res.body.data.find((recipe: any) => recipe.deluxe)
    assert.equal(premium.ingredients, null)
    assert.equal(premium.instructions, null)
    assert.equal(challenges.recipePaywallChallenge.solved, false)
  })

  void it('allows Deluxe members to read recipes without solving the bypass challenge', async () => {
    const res = await request(app).post('/rest/recipes/search').set('Authorization', `Bearer ${deluxeToken}`).send({ query: 'CARROT' })
    assert.equal(res.status, 200)
    assert.ok(res.body.data[0].instructions)
    assert.equal(challenges.recipePaywallChallenge.solved, false)
  })

  void it('reveals a Deluxe recipe through the flag without changing membership or wallet balance', async () => {
    const before = await WalletModel.findOne({ where: { UserId: userId } })
    const res = await request(app).post('/rest/recipes/search').set('Authorization', `Bearer ${token}`).send({ query: 'carrot', includeInstructions: true })
    assert.equal(res.status, 200)
    assert.ok(res.body.data[0].ingredients)
    assert.ok(res.body.data[0].instructions)
    assert.equal(challenges.recipePaywallChallenge.solved, true)
    assert.equal((await UserModel.findByPk(userId))!.role, security.roles.customer)
    assert.equal((await WalletModel.findOne({ where: { UserId: userId } }))!.balance, before!.balance)
  })

  void it('does not solve the challenge when no premium content is returned', async () => {
    const res = await request(app).post('/rest/recipes/search').set('Authorization', `Bearer ${token}`).send({ query: 'not-a-recipe', includeInstructions: true })
    assert.deepEqual(res.body.data, [])
    assert.equal(challenges.recipePaywallChallenge.solved, false)
  })

  void it('rejects invalid search parameters', async () => {
    for (const body of [{ query: {} }, { includeInstructions: 'true' }]) {
      assert.equal((await request(app).post('/rest/recipes/search').set('Authorization', `Bearer ${token}`).send(body)).status, 400)
    }
  })
})
