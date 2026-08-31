"""Fast, exact allow-list guards for SP-P9's public projection spine."""

from entries.entries_json import EntrantRowDTO, ReserveRowDTO
from entries.entries_me import MyEntryLineDTO, ReceiptEntryLineDTO
from entries.entries_site import (
    DrawCardDTO,
    DrawPlayerDTO,
    HonorDTO,
    PersonReferenceDTO,
    PlayerDrawPathDTO,
    PlayerEventDTO,
    PlayerMatchDTO,
    PlayerMatchSideDTO,
    PlayerPageDTO,
    PublicPersonIdentityDTO,
    ScheduleDayFacetDTO,
    ScheduleFacetsDTO,
    ScheduleMatchDTO,
    ScheduleSideDTO,
    SeedLineDTO,
    TeamDTO,
    WinnersEventDTO,
)


EXPECTED = {
    PublicPersonIdentityDTO: {"id", "name"},
    PersonReferenceDTO: {"identity", "resolution", "label"},
    EntrantRowDTO: {"person", "club", "eventCodes"},
    ReserveRowDTO: {"eventCode", "position", "person", "club"},
    DrawCardDTO: {"drawKey", "eventCode", "discipline", "kind", "size", "hasConsolation", "matchCoverage", "recordScope", "topologyScope", "roundCount", "champions", "finalists", "remainingMatchCount", "historical", "sourceUrl"},
    DrawPlayerDTO: {"playerKey", "person", "club", "eventCodes"},
    TeamDTO: {"participantKey", "persons", "club", "seed"},
    SeedLineDTO: {"seed", "persons", "club"},
    HonorDTO: {"persons", "club"},
    WinnersEventDTO: {"eventCode", "discipline", "decided", "winner", "runnerUp", "semifinalists", "finalScore", "finalists"},
    PlayerDrawPathDTO: {"roundLabel", "opponents"},
    PlayerEventDTO: {"code", "discipline", "partner", "seed", "drawPath"},
    PlayerMatchSideDTO: {"persons", "placeholder", "winner", "seed"},
    PlayerMatchDTO: {"eventCode", "roundLabel", "sides", "score", "decided", "scheduledTime", "court", "playedOn", "localTime", "courtLabel", "status", "durationMinutes", "updatedAt"},
    PlayerPageDTO: {"person", "club", "events", "matches"},
    ScheduleDayFacetDTO: {"day", "count"},
    ScheduleSideDTO: {"participantKey", "persons", "placeholder"},
    ScheduleMatchDTO: {"matchKey", "source", "eventCode", "discipline", "roundLabel", "status", "scheduledDate", "scheduledTime", "court", "sides", "score", "walkover", "updatedAt"},
    ScheduleFacetsDTO: {"days", "events", "courts", "states"},
    MyEntryLineDTO: {"eventCode", "discipline", "player", "state", "entryId", "canWithdraw", "resultBadge", "partner"},
    ReceiptEntryLineDTO: {"eventCode", "discipline", "player", "partner", "state"},
}


def key_set(model):
    return set(model.model_fields)


def test_every_sp_p9_serializer_has_its_exact_allow_list():
    for model, expected in EXPECTED.items():
        assert key_set(model) == expected, model.__name__


def test_negative_control_an_unregistered_key_is_rejected_by_the_guard():
    expected = EXPECTED[PublicPersonIdentityDTO]
    assert expected != expected | {"email"}


def test_the_identity_and_contact_privacy_seams_stay_separate():
    forbidden = {"email", "phone", "feeCents", "submission", "accountId"}
    for model in EXPECTED:
        assert key_set(model).isdisjoint(forbidden), model.__name__
