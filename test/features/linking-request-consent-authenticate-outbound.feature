Feature: Outbound API server

Scenario: PatchLinkingRequestConsentIDAuthenticate
  Given Outbound API server
  When I send a 'PatchLinkingRequestConsentIDAuthenticate' request
  Then I get a response with a status code of '200'
