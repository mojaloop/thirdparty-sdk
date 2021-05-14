Feature: Outbound API server

Scenario: GetProviders
  Given Outbound API server
  When I send a 'GetProviders' request
  Then I get a response with a status code of '200'
