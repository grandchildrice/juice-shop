/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

describe('Delivery address authorization', () => {
  let addressId: number

  beforeEach(() => {
    cy.login({ email: 'jim', password: 'ncc-1701' })
    cy.getCookie('token').then((token) => {
      cy.request({
        url: '/api/Addresss',
        method: 'POST',
        headers: { Authorization: `Bearer ${token?.value}` },
        body: {
          fullName: 'Jim Demo Address', mobileNum: 1234567890, zipCode: '12345',
          streetAddress: '10 Demo Street', city: 'Test City', country: 'Test Country'
        }
      }).then((response) => { addressId = response.body.data.id })
    })
    cy.login({ email: 'bender', password: 'OhG0dPlease1nsertLiquor!' })
  })

  describe('challenge "anonymousAddressChallenge"', () => {
    it('should deny another logged-in user but reveal the address after signing out', () => {
      cy.then(() => cy.visit(`/#/address/preview/${addressId}`))
      cy.get('[role="alert"]').should('contain', 'another customer')
      cy.get('#navbarAccount').click()
      cy.get('#navbarLogoutButton').click()
      cy.then(() => cy.visit(`/#/address/preview/${addressId}`))
      cy.get('#addressPreview').should('contain', 'Jim Demo Address').and('contain', '10 Demo Street')
      cy.expectChallengeSolved({ challenge: 'Signed Out Address Preview' })
    })
  })

  describe('challenge "checkoutAddressChallenge"', () => {
    it('should display another customer address through the current basket in the order summary', () => {
      cy.getCookie('token').then((token) => {
        cy.request({
          url: `/api/Addresss/${addressId}`,
          headers: { Authorization: `Bearer ${token?.value}` },
          failOnStatusCode: false
        }).its('status').should('equal', 400)
      })
      cy.window().then((win) => {
        win.sessionStorage.setItem('addressId', String(addressId))
        win.sessionStorage.setItem('deliveryMethodId', '1')
        win.sessionStorage.setItem('paymentId', 'wallet')
      })
      cy.visit('/#/order-summary')
      cy.contains('Jim Demo Address').should('be.visible')
      cy.contains('10 Demo Street').should('be.visible')
      cy.expectChallengeSolved({ challenge: 'Borrowed Delivery Address' })
    })
  })
})
