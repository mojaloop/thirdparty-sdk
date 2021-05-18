Feature: Inbound API server

Scenario: PutServicesByServiceType
  Given Inbound API server
  When I receive a 'PutServicesByServiceType' request
  Then I get a response with a status code of '200'

Scenario: PutServicesByServiceTypeAndError
  Given Inbound API server
  When I receive a 'PutServicesByServiceTypeAndError' request
  Then I get a response with a status code of '200'
