Feature: Inbound API server

Scenario: ParticipantsByTypeAndID3
  Given Inbound API server
  When I receive a 'ParticipantsByTypeAndID3' request
  Then I get a response with a status code of '200'
