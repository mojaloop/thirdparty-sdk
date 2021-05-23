Feature: Outbound API server

Scenario: GetLinkingAccountsByUserId
  Given Outbound API server
  When I send a 'GetLinkingAccountsByUserId' request
  Then I get a response with a status code of '200'
