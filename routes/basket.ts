/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import { ProductModel } from '../models/product'
import { BasketModel } from '../models/basket'
import { AddressModel } from '../models/address'
import * as challengeUtils from '../lib/challengeUtils'

import * as utils from '../lib/utils'
import * as security from '../lib/insecurity'
import { challenges } from '../data/datacache'

export function setDeliveryAddress () {
  return async (req: Request, res: Response) => {
    const user = security.authenticatedUsers.from(req)
    if (!user) {
      res.status(401).json({ error: 'Please log in to select a delivery address.' })
      return
    }
    const basket = await BasketModel.findOne({ where: { id: req.params.id, UserId: user.data.id } })
    if (!basket) {
      res.status(403).json({ error: 'This basket belongs to another customer.' })
      return
    }
    const addressId = Number(req.body.addressId)
    if (!Number.isInteger(addressId) || addressId < 1) {
      res.status(400).json({ error: 'A valid delivery address is required.' })
      return
    }
    const address = await AddressModel.findByPk(addressId)
    if (!address) {
      res.status(404).json({ error: 'Address not found.' })
      return
    }
    await basket.update({ addressId: address.id })
    challengeUtils.solveIf(challenges.checkoutAddressChallenge, () => address.UserId !== user.data.id)
    res.json({ status: 'success', data: address })
  }
}

export function retrieveBasket () {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id
      const basket = await BasketModel.findOne({ where: { id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })
      /* jshint eqeqeq:false */
      challengeUtils.solveIf(challenges.basketAccessChallenge, () => {
        const user = security.authenticatedUsers.from(req)
        const isValidId = id && id !== 'undefined' && id !== 'null' && id !== 'NaN'
        return user && isValidId && user.bid && user?.bid != parseInt(id, 10) // eslint-disable-line eqeqeq
      })
      if (((basket?.Products) != null) && basket.Products.length > 0) {
        for (let i = 0; i < basket.Products.length; i++) {
          basket.Products[i].name = req.__(basket.Products[i].name)
        }
      }

      res.json(utils.queryResultToJson(basket))
    } catch (error) {
      next(error)
    }
  }
}
