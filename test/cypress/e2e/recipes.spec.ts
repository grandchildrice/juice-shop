/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

describe('challenge "recipePaywallChallenge"', () => {
  it('should display a Deluxe recipe without upgrading when the reveal flag is supplied', () => {
    cy.login({ email: 'jim', password: 'ncc-1701' })
    cy.visit('/#/recipes')
    cy.contains('Carrot & Apple Blend').parent().should('contain', 'available to Deluxe members')
    cy.intercept('POST', '/rest/recipes/search', (req) => {
      req.body.includeInstructions = true
    }).as('revealRecipe')
    cy.get('#recipeQuery').focus().type('Carrot')
    cy.get('#searchRecipesButton').click()
    cy.wait('@revealRecipe')
    cy.get('.recipe-instructions').should('contain', 'serve chilled')
    cy.expectChallengeSolved({ challenge: 'Recipe Paywall Bypass' })
  })
})
