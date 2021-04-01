Feature: Outbound API server

Scenario: OutboundConsentRequestsValidatePatch
  Given Outbound API server
  When I send a 'OutboundConsentRequestsValidatePatch' request
  Then I get a response with a status code of '200'
