Feature: Inbound API server

Scenario: PostConsents
  Given Inbound API server
  When I receive a 'PostConsents' request
  Then I get a response with a status code of '202'

Scenario: PutConsentByID Signed
  Given Inbound API server
  When I receive a 'PutConsentByID' request
  Then I get a response with a status code of '202'

Scenario: PutConsentByID Verified
  Given Inbound API server
  When I receive a 'PutConsentByID' request
  Then I get a response with a status code of '200'
