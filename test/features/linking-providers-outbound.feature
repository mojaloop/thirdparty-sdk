Feature: Outbound API server

Scenario: GetLinkingProviders
  Given Outbound API server
  When I send a 'GetLinkingProviders' request
  Then I get a response with a status code of '200'
