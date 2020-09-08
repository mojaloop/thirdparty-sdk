Feature: Inbound API server

Scenario: UpdateThirdpartyAuthorization
  Given Inbound API server
  When I send a 'UpdateThirdpartyAuthorization' request
  Then I get a response with a status code of '200'