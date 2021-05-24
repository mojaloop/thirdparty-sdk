Feature: Outbound API server

Scenario: PatchLinkingRequestConsentIDValidate
  Given Outbound API server
  When I send a 'PatchLinkingRequestConsentIDValidate' request
  Then I get a response with a status code of '200'
