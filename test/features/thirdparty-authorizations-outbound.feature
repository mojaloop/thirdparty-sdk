Feature: Outbound API server

Scenario: VerifyThirdPartyAuthorization
  Given Outbound API server
  When I send a 'VerifyThirdPartyAuthorization' request
  Then I get a response with a status code of '200'