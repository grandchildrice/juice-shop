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

let app: Express
let ownerToken: string
let otherToken: string
const ownerEmail = 'email-login-owner@example.test'
const otherEmail = 'email-login-other@example.test'
const password = 'EmailLogin123!'

before(async () => {
  app = (await createTestApp()).app
  await register(app, { email: ownerEmail, password })
  await register(app, { email: otherEmail, password })
  ownerToken = (await login(app, { email: ownerEmail, password })).token
  otherToken = (await login(app, { email: otherEmail, password })).token
}, { timeout: 60000 })

beforeEach(async () => {
  await challenges.otpDeliveryChallenge.update({ solved: false })
})

async function sendCode (sendTo = ownerEmail) {
  const res = await request(app).post('/rest/user/email-login/request').send({ email: ownerEmail, sendTo, codeChannel: 'EMAIL' })
  assert.equal(res.status, 200)
  assert.equal(res.body.data.code, undefined)
  return res.body.data.requestId as string
}

async function readCode (token: string, id: string) {
  const res = await request(app).get('/rest/mailbox').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  return res.body.data.messages.find((message: { id: string }) => message.id === id)?.code as string | undefined
}

void describe('Email sign-in', () => {
  void it('delivers a code only to the selected mailbox and signs in to its own account normally', async () => {
    const requestId = await sendCode()
    assert.equal(await readCode(otherToken, requestId), undefined)
    const code = await readCode(ownerToken, requestId)
    assert.match(code!, /^\d{6}$/)
    const res = await request(app).post('/rest/user/email-login/verify').send({ requestId, code })
    assert.equal(res.status, 200)
    assert.equal(res.body.authentication.umail, ownerEmail)
    assert.equal(challenges.otpDeliveryChallenge.solved, false)
    const mailbox = await request(app).get('/rest/mailbox').set('Authorization', `Bearer ${res.body.authentication.token}`)
    assert.equal(mailbox.body.data.email, ownerEmail)
  })

  void it('solves the challenge only after verifying a code redirected to another mailbox', async () => {
    const requestId = await sendCode(otherEmail)
    assert.equal(await readCode(ownerToken, requestId), undefined)
    assert.equal(challenges.otpDeliveryChallenge.solved, false)
    const wrong = await request(app).post('/rest/user/email-login/verify').send({ requestId, code: '000000' })
    assert.equal(wrong.status, 401)
    assert.equal(challenges.otpDeliveryChallenge.solved, false)
    const code = await readCode(otherToken, requestId)
    const res = await request(app).post('/rest/user/email-login/verify').send({ requestId, code })
    assert.equal(res.status, 200)
    assert.equal(res.body.authentication.umail, ownerEmail)
    assert.equal(challenges.otpDeliveryChallenge.solved, true)
  })

  void it('requires authentication to read mail and ignores a caller-supplied mailbox address', async () => {
    assert.equal((await request(app).get('/rest/mailbox')).status, 401)
    const res = await request(app).get(`/rest/mailbox?email=${ownerEmail}`).set('Authorization', `Bearer ${otherToken}`)
    assert.equal(res.body.data.email, otherEmail)
  })

  void it('rejects malformed requests, unknown accounts and unsupported delivery channels', async () => {
    for (const body of [
      {},
      { email: ownerEmail, sendTo: otherEmail, codeChannel: 'SMS' },
      { email: 'unknown@example.test', sendTo: otherEmail, codeChannel: 'EMAIL' },
      { email: ownerEmail, sendTo: 'unknown@example.test', codeChannel: 'EMAIL' },
      { email: {}, sendTo: otherEmail, codeChannel: 'EMAIL' }
    ]) {
      assert.equal((await request(app).post('/rest/user/email-login/request').send(body)).status, 400)
    }
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({})).status, 401)
  })

  void it('does not bypass an account with TOTP enabled', async () => {
    const email = 'email-login-totp@example.test'
    await register(app, { email, password, totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' })
    const res = await request(app).post('/rest/user/email-login/request').send({ email, sendTo: otherEmail, codeChannel: 'EMAIL' })
    assert.equal(res.status, 400)
  })

  void it('consumes a code once and invalidates it when a replacement is requested', async () => {
    const oldId = await sendCode()
    const oldCode = await readCode(ownerToken, oldId)
    const requestId = await sendCode()
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId: oldId, code: oldCode })).status, 401)
    const code = await readCode(ownerToken, requestId)
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId, code })).status, 200)
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId, code })).status, 401)
  })

  void it('invalidates a code after five incorrect attempts', async () => {
    const requestId = await sendCode()
    const code = await readCode(ownerToken, requestId)
    for (let i = 0; i < 5; i++) {
      assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId, code: '000000' })).status, 401)
    }
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId, code })).status, 401)
  })

  void it('expires codes after five minutes', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
    const requestId = await sendCode()
    const code = await readCode(ownerToken, requestId)
    t.mock.timers.tick(5 * 60 * 1000 + 1)
    assert.equal(await readCode(ownerToken, requestId), undefined)
    assert.equal((await request(app).post('/rest/user/email-login/verify').send({ requestId, code })).status, 401)
  })
})
