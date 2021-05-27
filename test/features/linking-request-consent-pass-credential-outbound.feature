Feature: Outbound API server

Scenario: PostLinkingRequestConsentIDPassCredential
  Given Outbound API server
  When I send a 'PostLinkingRequestConsentIDPassCredential' request
  Then I get a response with a status code of '200'
