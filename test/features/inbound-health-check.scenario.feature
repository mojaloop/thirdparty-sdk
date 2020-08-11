Feature: Inbound API server

Scenario: Health Check
  Given Inbound API server
  When I get 'Health Check' response
  Then The status should be 'OK'

Scenario: Hello Check
  Given Inbound API server
  When I get 'Hello' response
  Then The 'hello' property should be 'inbound'