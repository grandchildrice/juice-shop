/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

describe('challenge "otpDeliveryChallenge"', () => {
  it('should sign in to another customer with a code delivered to the current customer mailbox', () => {
    cy.login({ email: 'jim', password: 'ncc-1701' })
    cy.task<string>('GetFromConfig', 'application.domain').then((domain) => {
      cy.intercept('POST', '/rest/user/email-login/request', (req) => {
        req.body.sendTo = `jim@${domain}`
      }).as('sendCode')
      cy.visit('/#/email-login')
      cy.get('#otpEmail').type(`bender@${domain}`)
      cy.get('#sendCodeButton').click()
      cy.wait('@sendCode').then((interception) => {
        const requestId = interception.response?.body.data.requestId
        cy.getCookie('token').then((token) => {
          cy.request({ url: '/rest/mailbox', headers: { Authorization: `Bearer ${token?.value}` } }).then((response) => {
            const message = response.body.data.messages.find((mail) => mail.id === requestId)
            expect(message.code).to.match(/^\d{6}$/)
            cy.get('#otpCode').type(message.code)
            cy.get('#verifyCodeButton').click()
            cy.url().should('include', '/search')
            cy.getCookie('token').then((signedIn) => {
              cy.request({ url: '/rest/mailbox', headers: { Authorization: `Bearer ${signedIn?.value}` } })
                .its('body.data.email').should('equal', `bender@${domain}`)
            })
          })
        })
      })
    })
    cy.expectChallengeSolved({ challenge: 'Misdelivered Login Code' })
  })
})
