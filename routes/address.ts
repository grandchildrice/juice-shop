/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response } from 'express'
import { AddressModel } from '../models/address'
import { challenges } from '../data/datacache'
import * as security from '../lib/insecurity'
import * as challengeUtils from '../lib/challengeUtils'

export function previewAddress () {
  return async (req: Request, res: Response) => {
    const user = security.authenticatedUsers.from(req)
    if (req.headers.authorization && !user) {
      res.status(401).json({ error: 'Invalid session.' })
      return
    }
    const address = await AddressModel.findByPk(req.params.id)
    if (!address) {
      res.status(404).json({ error: 'Address not found.' })
      return
    }
    if (user && address.UserId !== user.data.id) {
      res.status(403).json({ error: 'This address belongs to another customer.' })
      return
    }
    challengeUtils.solveIf(challenges.anonymousAddressChallenge, () => !user)
    res.json({ status: 'success', data: address })
  }
}

export function getAddress () {
  return async (req: Request, res: Response) => {
    const addresses = await AddressModel.findAll({ where: { UserId: req.body.UserId } })
    res.status(200).json({ status: 'success', data: addresses })
  }
}

export function getAddressById () {
  return async (req: Request, res: Response) => {
    const address = await AddressModel.findOne({ where: { id: req.params.id, UserId: req.body.UserId } })
    if (address != null) {
      res.status(200).json({ status: 'success', data: address })
    } else {
      res.status(400).json({ status: 'error', data: 'Malicious activity detected.' })
    }
  }
}

export function delAddressById () {
  return async (req: Request, res: Response) => {
    const address = await AddressModel.destroy({ where: { id: req.params.id, UserId: req.body.UserId } })
    if (address) {
      res.status(200).json({ status: 'success', data: 'Address deleted successfully.' })
    } else {
      res.status(400).json({ status: 'error', data: 'Malicious activity detected.' })
    }
  }
}
