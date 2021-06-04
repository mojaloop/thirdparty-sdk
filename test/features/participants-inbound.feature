Feature: Inbound API server

Scenario: ParticipantsByTypeAndID3
  Given Inbound API server
  When I receive a 'ParticipantsByTypeAndID3' request
  Then I get a response with a status code of '200'

Scenario: ParticipantsErrorByTypeAndID
  Given Inbound API server
  When I receive a 'ParticipantsErrorByTypeAndID' request
  Then I get a response with a status code of '200'

Scenario: PutParticipantsByID
  Given Inbound API server
  When I receive a 'PutParticipantsByID' request
  Then I get a response with a status code of '200'

Scenario: PutParticipantsByIDAndError
  Given Inbound API server
  When I receive a 'PutParticipantsByIDAndError' request
  Then I get a response with a status code of '200'
