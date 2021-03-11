Feature: Inbound API server

Scenario: Health Check
  Given Inbound API server
  When I get 'Health Check' response
  Then The status should be 'OK'
