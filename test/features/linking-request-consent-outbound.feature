Feature: Outbound API server

Scenario: PostLinkingRequestConsent
  Given Outbound API server
  When I send a 'PostLinkingRequestConsent' request
  Then I get a response with a status code of '200'
