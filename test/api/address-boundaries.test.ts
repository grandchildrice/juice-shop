/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Express } from 'express'
import { createTestApp } from './helpers/setup'
import { login, register } from './helpers/auth'
import { challenges } from '../../data/datacache'
import { BasketModel } from '../../models/basket'

let app: Express
let owner: { token: string, bid: number }
let other: { token: string, bid: number }
let addressId: number
const fullName = 'Address Owner'

before(async () => {
  app = (await createTestApp()).app
  await register(app, { email: 'address-owner@example.test', password: 'Owner123!' })
  await register(app, { email: 'address-other@example.test', password: 'Other123!' })
  owner = await login(app, { email: 'address-owner@example.test', password: 'Owner123!' })
  other = await login(app, { email: 'address-other@example.test', password: 'Other123!' })
  const res = await request(app).post('/api/Addresss').set('Authorization', `Bearer ${owner.token}`).send({
    fullName, mobileNum: 1234567890, zipCode: '12345', streetAddress: '10 Demo Street', city: 'Test City', country: 'Test Country'
  })
  assert.equal(res.status, 201)
  addressId = res.body.data.id
}, { timeout: 60000 })

beforeEach(async () => {
  await challenges.anonymousAddressChallenge.update({ solved: false })
  await challenges.checkoutAddressChallenge.update({ solved: false })
})

void describe('Address preview', () => {
  void it('shows the owner address but refuses a different signed-in customer', async () => {
    const own = await request(app).get(`/rest/address/${addressId}/preview`).set('Authorization', `Bearer ${owner.token}`)
    assert.equal(own.status, 200)
    assert.equal(own.body.data.fullName, fullName)
    assert.equal((await request(app).get(`/rest/address/${addressId}/preview`).set('Authorization', `Bearer ${other.token}`)).status, 403)
    assert.equal(challenges.anonymousAddressChallenge.solved, false)
  })

  void it('reveals the address after removing authentication and solves the challenge', async () => {
    const res = await request(app).get(`/rest/address/${addressId}/preview`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.fullName, fullName)
    assert.equal(challenges.anonymousAddressChallenge.solved, true)
  })

  void it('rejects invalid sessions and does not solve on a missing address', async () => {
    assert.equal((await request(app).get(`/rest/address/${addressId}/preview`).set('Authorization', 'Bearer invalid')).status, 401)
    assert.equal((await request(app).get('/rest/address/999999/preview')).status, 404)
    assert.equal(challenges.anonymousAddressChallenge.solved, false)
  })

  void it('keeps direct address retrieval protected', async () => {
    assert.equal((await request(app).get(`/api/Addresss/${addressId}`)).status, 401)
    assert.equal((await request(app).get(`/api/Addresss/${addressId}`).set('Authorization', `Bearer ${other.token}`)).status, 400)
  })
})

void describe('Basket delivery address', () => {
  void it('selects an owned address normally without solving the challenge', async () => {
    const res = await request(app).post(`/rest/basket/${owner.bid}/address`).set('Authorization', `Bearer ${owner.token}`).send({ addressId })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.fullName, fullName)
    assert.equal((await BasketModel.findByPk(owner.bid))!.addressId, addressId)
    assert.equal(challenges.checkoutAddressChallenge.solved, false)
  })

  void it('reveals a foreign address when it is associated with an owned basket', async () => {
    const res = await request(app).post(`/rest/basket/${other.bid}/address`).set('Authorization', `Bearer ${other.token}`).send({ addressId })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.fullName, fullName)
    assert.equal((await BasketModel.findByPk(other.bid))!.addressId, addressId)
    assert.equal(challenges.checkoutAddressChallenge.solved, true)
  })

  void it('requires login and checks basket ownership independently of address ownership', async () => {
    assert.equal((await request(app).post(`/rest/basket/${owner.bid}/address`).send({ addressId })).status, 401)
    assert.equal((await request(app).post(`/rest/basket/${owner.bid}/address`).set('Authorization', `Bearer ${other.token}`).send({ addressId })).status, 403)
    assert.equal(challenges.checkoutAddressChallenge.solved, false)
  })

  void it('rejects missing, invalid and nonexistent delivery addresses', async () => {
    for (const value of [undefined, '', null, -1, 'bad']) {
      assert.equal((await request(app).post(`/rest/basket/${other.bid}/address`).set('Authorization', `Bearer ${other.token}`).send({ addressId: value })).status, 400)
    }
    assert.equal((await request(app).post(`/rest/basket/${other.bid}/address`).set('Authorization', `Bearer ${other.token}`).send({ addressId: 999999 })).status, 404)
    assert.equal(challenges.checkoutAddressChallenge.solved, false)
  })
})
