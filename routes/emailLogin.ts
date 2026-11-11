/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { randomInt, randomUUID } from 'node:crypto'
import { type Request, type Response } from 'express'
import { UserModel } from '../models/user'
import { BasketModel } from '../models/basket'
import { challenges } from '../data/datacache'
import * as security from '../lib/insecurity'
import * as utils from '../lib/utils'
import * as challengeUtils from '../lib/challengeUtils'

interface LoginCode {
  userId: number
  recipient: string
  code: string
  expiresAt: number
  attempts: number
}

export function emailLogin () {
  const codes = new Map<string, LoginCode>()

  function removeExpiredCodes () {
    for (const [id, code] of codes) {
      if (code.expiresAt <= Date.now()) codes.delete(id)
    }
  }

  return {
    request: async (req: Request, res: Response) => {
      removeExpiredCodes()
      const { email, sendTo, codeChannel } = req.body
      if (typeof email !== 'string' || typeof sendTo !== 'string' || codeChannel !== 'EMAIL') {
        res.status(400).json({ error: 'An email address, recipient and EMAIL channel are required.' })
        return
      }
      const user = await UserModel.findOne({ where: { email } })
      const recipient = await UserModel.findOne({ where: { email: sendTo } })
      if (!user || !recipient || user.totpSecret || ![security.roles.customer, security.roles.deluxe].includes(user.role)) {
        res.status(400).json({ error: 'Email sign-in is not available for this account or recipient.' })
        return
      }
      for (const [id, code] of codes) {
        if (code.userId === user.id) codes.delete(id)
      }
      const requestId = randomUUID()
      // Mail is delivered only to the shop's simulated mailboxes.
      codes.set(requestId, {
        userId: user.id,
        recipient: sendTo,
        code: String(randomInt(100000, 1000000)),
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0
      })
      res.json({ status: 'success', data: { requestId } })
    },

    inbox: async (req: Request, res: Response) => {
      removeExpiredCodes()
      const session = security.authenticatedUsers.from(req)
      const user = session ? await UserModel.findByPk(session.data.id) : null
      if (!user) {
        res.status(401).json({ error: 'Please log in to open your mailbox.' })
        return
      }
      const messages = [...codes].filter(([, code]) => code.recipient === user.email).map(([id, code]) => ({
        id,
        code: code.code,
        expiresAt: code.expiresAt
      }))
      res.json({ status: 'success', data: { email: user.email, messages } })
    },

    verify: async (req: Request, res: Response) => {
      removeExpiredCodes()
      const { requestId, code } = req.body
      const pending = typeof requestId === 'string' ? codes.get(requestId) : undefined
      if (!pending || typeof code !== 'string' || pending.code !== code) {
        if (pending && ++pending.attempts >= 5) codes.delete(requestId)
        res.status(401).json({ error: 'Invalid or expired sign-in code.' })
        return
      }
      codes.delete(requestId)
      const user = await UserModel.findByPk(pending.userId)
      if (!user || user.totpSecret || ![security.roles.customer, security.roles.deluxe].includes(user.role)) {
        res.status(401).json({ error: 'Email sign-in is not available for this account.' })
        return
      }
      const [basket] = await BasketModel.findOrCreate({ where: { UserId: user.id } })
      const authenticatedUser = { data: utils.queryResultToJson(user).data, bid: basket.id }
      const token = security.authorize(authenticatedUser)
      security.authenticatedUsers.put(token, authenticatedUser)
      challengeUtils.solveIf(challenges.otpDeliveryChallenge, () => pending.recipient !== user.email)
      res.json({ authentication: { token, bid: basket.id, umail: user.email } })
    }
  }
}
