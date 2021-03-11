Feature: Inbound API server

Scenario: PatchConsentRequest
  Given Inbound API server
  When I receive a 'PatchConsentRequest' request
  Then I get a response with a status code of '202'

Scenario: NotifyErrorConsentRequests
  Given Inbound API server
  When I receive a 'NotifyErrorConsentRequests' request
  Then I get a response with a status code of '200'
