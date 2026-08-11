"""Static data for the ``demo`` scenario — eight workspaces and a player pool.

**Local demo data only.** The organisation names below are real badminton
organisations, supplied by the product owner as a realism target for a
local proof-of-concept database. Nothing here is an endorsement, an
affiliation, or a claim about those organisations, and none of it is
intended for publication or deployment. The eighth workspace's
organisation, dates and event list are *invented* — the owner's source
list was truncated at that entry — and are marked as such below.

**Why a static pool rather than the RNG names in ``factories.py``.** The
demo's whole point is that a director recognises what they are looking at:
age-banded junior events need age-appropriate entrants, club columns need
clubs that repeat across events the way real clubs do, and the same person
has to be able to appear in two tournaments. ``_name()``'s random pairing
of first and last names satisfies none of that. The pool is therefore
~100 named people with a gender, a birth year and a club, and the
workspaces draw from it by eligibility.

Genders and clubs only reach the database through the **Entries** pipeline
(``entry_players`` carries both); Meet's ``PlayerDTO`` and Bracket's
``BracketPlayerDTO`` have no such columns, so on a roster the club rides in
``notes``. That asymmetry is the product's, not this file's.
"""
from __future__ import annotations

from typing import Optional, Sequence

# ---- the player pool -----------------------------------------------------
# (full name, gender, birth year, club). Birth years are the eligibility
# field R12 describes — a plain number, never a trigger for behaviour.
# Tournament year is 2026 throughout, so U11 means born 2016 or later.

PLAYERS: tuple[tuple[str, str, int, str], ...] = (
    # --- U10 / U11 (born 2016-2018) -------------------------------------
    ("Aiden Nakamura", "M", 2017, "Fremont Badminton Academy"),
    ("Sofia Ramirez", "F", 2017, "Fremont Badminton Academy"),
    ("Ethan Chowdhury", "M", 2018, "Milpitas Youth BC"),
    ("Mia Fernandes", "F", 2018, "Milpitas Youth BC"),
    ("Rohan Balakrishnan", "M", 2016, "Bay Badminton Center"),
    ("Ivy Tran", "F", 2016, "Bay Badminton Center"),
    ("Caleb Okonjo", "M", 2017, "California Badminton"),
    ("Hana Yoshida", "F", 2017, "California Badminton"),
    ("Dylan Marchetti", "M", 2016, "Fremont Badminton Academy"),
    ("Priya Raghunathan", "F", 2016, "Milpitas Youth BC"),
    ("Noah Villanueva", "M", 2018, "Bay Badminton Center"),
    ("Elise Kwon", "F", 2018, "California Badminton"),
    ("Mateo Salcedo", "M", 2016, "Milpitas Youth BC"),
    ("Anika Deshmukh", "F", 2017, "Fremont Badminton Academy"),
    ("Owen Lindqvist", "M", 2017, "Bay Badminton Center"),
    ("Zara Haddadi", "F", 2016, "California Badminton"),
    ("Julian Ocampo", "M", 2016, "Fremont Badminton Academy"),
    ("Leila Brahimi", "F", 2018, "Milpitas Youth BC"),
    ("Kenji Watanabe", "M", 2016, "Bay Badminton Center"),
    ("Amara Nwosu", "F", 2016, "California Badminton"),
    # --- U13 (born 2014-2015) --------------------------------------------
    ("Lucas Meireles", "M", 2014, "Dallas Badminton Academy"),
    ("Isabella Cheng", "F", 2014, "Dallas Badminton Academy"),
    ("Arjun Venkatesan", "M", 2015, "Houston Shuttle Club"),
    ("Nora Abdulrahman", "F", 2015, "Houston Shuttle Club"),
    ("Felix Andersen", "M", 2014, "San Diego Badminton Club"),
    ("Camila Estrada", "F", 2014, "San Diego Badminton Club"),
    ("Tobias Reinhardt", "M", 2015, "Austin Badminton Club"),
    ("Sana Qureshi", "F", 2015, "Austin Badminton Club"),
    ("Gabriel Osei-Bonsu", "M", 2014, "Dallas Badminton Academy"),
    ("Yuki Matsuda", "F", 2014, "San Diego Badminton Club"),
    ("Sebastian Duarte", "M", 2015, "Houston Shuttle Club"),
    ("Riya Chandrasekar", "F", 2015, "Dallas Badminton Academy"),
    # --- U15 (born 2012-2013) --------------------------------------------
    ("Marcus Delacroix", "M", 2012, "San Diego Badminton Club"),
    ("Elena Petrovic", "F", 2012, "San Diego Badminton Club"),
    ("Devin Aluwihare", "M", 2013, "Dallas Badminton Academy"),
    ("Freya Lindholm", "F", 2013, "Dallas Badminton Academy"),
    ("Idris Bello", "M", 2012, "Houston Shuttle Club"),
    ("Naomi Sasaki", "F", 2012, "Houston Shuttle Club"),
    ("Theo Vasquez", "M", 2013, "Austin Badminton Club"),
    ("Aisha Rahimi", "F", 2013, "Austin Badminton Club"),
    ("Karan Mehrotra", "M", 2012, "San Diego Badminton Club"),
    ("Clara Bjornsen", "F", 2013, "Dallas Badminton Academy"),
    ("Emeka Adeyemi", "M", 2013, "Houston Shuttle Club"),
    ("Lin Xiaowen", "F", 2012, "Austin Badminton Club"),
    # --- U17 (born 2010-2011) --------------------------------------------
    ("Nathaniel Ortega", "M", 2010, "San Diego Badminton Club"),
    ("Saanvi Iyer", "F", 2010, "San Diego Badminton Club"),
    ("Damian Kowalczyk", "M", 2011, "Dallas Badminton Academy"),
    ("Beatriz Almeida", "F", 2011, "Dallas Badminton Academy"),
    ("Hugo Lefevre", "M", 2010, "Houston Shuttle Club"),
    ("Tanvi Bhattacharya", "F", 2010, "Houston Shuttle Club"),
    ("Ryan Alsaadi", "M", 2011, "Austin Badminton Club"),
    ("Nadia Popov", "F", 2011, "Austin Badminton Club"),
    ("Joshua Wanjiru", "M", 2010, "San Diego Badminton Club"),
    ("Emi Kurosawa", "F", 2011, "Dallas Badminton Academy"),
    # --- U19 (born 2008-2009) --------------------------------------------
    ("Andres Quintanilla", "M", 2008, "San Diego Badminton Club"),
    ("Meera Sundaram", "F", 2008, "San Diego Badminton Club"),
    ("Viktor Novotny", "M", 2009, "Dallas Badminton Academy"),
    ("Chloe Baptiste", "F", 2009, "Dallas Badminton Academy"),
    ("Samuel Mwangi", "M", 2008, "Houston Shuttle Club"),
    ("Ayaka Nishimura", "F", 2008, "Houston Shuttle Club"),
    ("Ibrahim Chaudhry", "M", 2009, "Austin Badminton Club"),
    ("Lucia Ferrante", "F", 2009, "Austin Badminton Club"),
    ("Peter Lindgren", "M", 2008, "Portland Feathers BC"),
    ("Jasmine Oyelaran", "F", 2009, "Portland Feathers BC"),
    # --- Open / 18+ (born 1996-2007) --------------------------------------
    ("Daniel Sittipong", "M", 1998, "Bellevue Badminton Club"),
    ("Grace Halvorsen", "F", 1999, "Bellevue Badminton Club"),
    ("Vikram Anantharaman", "M", 1997, "Bay Badminton Center"),
    ("Wei-Lin Chang", "F", 1997, "Bay Badminton Center"),
    ("Oliver Ashbourne", "M", 2000, "Seattle Smash BC"),
    ("Renata Vasconcelos", "F", 2000, "Seattle Smash BC"),
    ("Hasan Demirkol", "M", 2001, "California Badminton"),
    ("Ji-Woo Park", "F", 2001, "California Badminton"),
    ("Colin Macgregor", "M", 1996, "Portland Feathers BC"),
    ("Adaeze Ikenna", "F", 1996, "Portland Feathers BC"),
    ("Ravi Muthukrishnan", "M", 2002, "Austin Badminton Club"),
    ("Sofie Aagaard", "F", 2002, "Austin Badminton Club"),
    ("Emmanuel Bakayoko", "M", 2003, "Nashville Badminton Association"),
    ("Tara Brennan", "F", 2003, "Nashville Badminton Association"),
    ("Kenzo Fujimoto", "M", 2004, "Bellevue Badminton Club"),
    ("Marisol Herrera", "F", 2004, "Bellevue Badminton Club"),
    ("Alexei Sorokin", "M", 2005, "Seattle Smash BC"),
    ("Ingrid Solberg", "F", 2005, "Seattle Smash BC"),
    ("Nikhil Ramanathan", "M", 2006, "Bay Badminton Center"),
    ("Bianca Costanzo", "F", 2006, "Bay Badminton Center"),
    ("Jonah Ellsworth", "M", 2007, "California Badminton"),
    ("Thandiwe Moyo", "F", 2007, "California Badminton"),
    ("Santiago Belmonte", "M", 1999, "San Diego Badminton Club"),
    ("Keiko Arimura", "F", 1999, "San Diego Badminton Club"),
    ("Farhan Siddiqui", "M", 1998, "Houston Shuttle Club"),
    ("Delphine Rousseau", "F", 1998, "Houston Shuttle Club"),
    ("Marek Zielinski", "M", 2000, "Nashville Badminton Association"),
    ("Aurora Pellegrini", "F", 2000, "Nashville Badminton Association"),
    ("Terrence Ashby", "M", 2002, "Dallas Badminton Academy"),
    ("Sunita Chaudhary", "F", 2002, "Dallas Badminton Academy"),
    ("Lars Hovden", "M", 2001, "Portland Feathers BC"),
    ("Noor Al-Mansouri", "F", 2001, "Portland Feathers BC"),
    # --- 35+ (born 1982-1991) ---------------------------------------------
    ("Gregory Whitfield", "M", 1986, "San Diego Badminton Club"),
    ("Petra Havlickova", "F", 1987, "San Diego Badminton Club"),
    ("Anand Krishnamurthy", "M", 1984, "Bay Badminton Center"),
    ("Michelle Lauzon", "F", 1985, "Bay Badminton Center"),
    ("Olusegun Adebayo", "M", 1989, "Houston Shuttle Club"),
    ("Cristina Mendoza", "F", 1990, "Houston Shuttle Club"),
    ("Stefan Groenewald", "M", 1982, "Seattle Smash BC"),
    ("Hyun-Ji Baek", "F", 1991, "Seattle Smash BC"),
    # --- 50+ (born 1968-1976) ---------------------------------------------
    ("Raymond Fitzgerald", "M", 1971, "San Diego Badminton Club"),
    ("Sylvia Brandt", "F", 1972, "San Diego Badminton Club"),
    ("Hector Palomino", "M", 1969, "California Badminton"),
    ("Margaret Okoro", "F", 1974, "California Badminton"),
    ("Tomasz Wisniewski", "M", 1968, "Portland Feathers BC"),
    ("Junko Hayashida", "F", 1976, "Portland Feathers BC"),
)


def eligible(
    *,
    gender: Optional[str] = None,
    min_year: Optional[int] = None,
    max_year: Optional[int] = None,
) -> list[tuple[str, str, int, str]]:
    """The pool, filtered. ``min_year``/``max_year`` are inclusive bounds on
    the birth year, so U13 in 2026 is ``min_year=2014``."""
    return [
        person
        for person in PLAYERS
        if (gender is None or person[1] == gender)
        and (min_year is None or person[2] >= min_year)
        and (max_year is None or person[2] <= max_year)
    ]


def slug_of(name: str) -> str:
    """A stable, readable participant id from a person's name.

    Readable ids matter here in a way they do not in the other scenarios:
    these strings are what an operator sees in a draw's URL and in the
    ``sourceEntryId`` provenance chain when they go looking for why a
    player is in a bracket.
    """
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")


# ---- workspace specs -----------------------------------------------------
#
# ``kind``     — 'meet' or 'bracket'; decides which engine the workspace runs.
# ``modules``  — the enable set, deliberately varied so the Hub shows the
#                control-plane model rather than eight identical rows.
# ``events``   — bracket draws (id/label/format/eligibility/size) or, for a
#                meet, the ``rankCounts`` vocabulary.
# ``entries``  — public entry page config, or None for no Entries module.
# ``play``     — 'full' | 'partial' | 'spread' | 'none'; how far the floor
#                gets driven, so the demo has finished events, live ones and
#                untouched ones instead of one uniform state.

WORKSPACES: tuple[dict, ...] = (
    {
        "key": "fk-junior-league",
        "name": "F&K Junior League Winter 2026",
        "org": "F & K Tournaments",
        "city": "Fremont, U.S.A.",
        "date": "2026-01-24",
        "dates": "2026-01-24 to 2026-03-07",
        "kind": "meet",
        "modules": {"meet": "enabled", "display": "enabled"},
        # A league IS a dual meet — two clubs, matched ranks — which is
        # exactly the shape Meet models. U10/U11 become the rank vocabulary.
        "meet": {
            "groups": ("Fremont Badminton Academy", "Milpitas Youth BC"),
            "ranks": {"U10": 5, "U11": 5},
            "courts": 3,
            "pool": {"min_year": 2016, "max_year": 2018},
        },
        "play": "full",
    },
    {
        "key": "husky-open",
        "name": "2026 Husky Open",
        "org": "The Bellevue Badminton Club",
        "city": "Seattle",
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-15",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "display": "enabled"},
        "courts": 6,
        "events": (
            {"id": "open-a", "label": "Open A Singles", "code": "OA",
             "format": "se", "size": 16, "min_year": 1990, "max_year": 2008},
            {"id": "open", "label": "Open Singles", "code": "OS",
             "format": "de", "size": 16, "min_year": 1996, "max_year": 2008},
        ),
        "play": "partial",
    },
    {
        "key": "polar-bear",
        "name": "2026 Polar Bear LXXI",
        "org": "California Badminton",
        "city": "Union City",
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-15",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "display": "enabled"},
        "courts": 8,
        # Four flights in four different formats — the FORMAT_REGISTRY
        # breadth, on one screen.
        "events": (
            {"id": "open-a", "label": "Open A", "code": "A",
             "format": "se", "size": 16, "min_year": 1990, "max_year": 2008},
            {"id": "open-b", "label": "Open B", "code": "B",
             "format": "de", "size": 16, "min_year": 1982, "max_year": 2009},
            {"id": "open-c", "label": "Open C", "code": "C",
             "format": "rr", "size": 8, "min_year": 1968, "max_year": 2009},
            {"id": "open-d", "label": "Open D", "code": "D",
             "format": "monrad", "size": 16, "min_year": 1968, "max_year": 2011},
        ),
        "play": "full",
    },
    {
        "key": "ut-austin-lny",
        "name": "UT Austin Lunar New Year Tournament",
        "org": "Michigan Badminton Club",
        "city": "Austin",
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-15",
        "kind": "bracket",
        # Deliberately the thinnest module set in the demo: Bracket alone,
        # no Display. The Hub should not look like every workspace is the
        # same workspace.
        "modules": {"bracket": "enabled"},
        "courts": 4,
        "events": (
            {"id": "open", "label": "Open", "code": "OS",
             "format": "compass", "size": 16, "min_year": 1996, "max_year": 2008},
            {"id": "adult-18", "label": "18+", "code": "18",
             "format": "swiss", "size": 12, "min_year": 1982, "max_year": 2008,
             "config": {"swiss_rounds": 4}},
        ),
        "play": "none",
    },
    {
        "key": "dfw-lewisville",
        "name": (
            "2026 YONEX DFW Badminton Lewisville South Open "
            "Regional Championships"
        ),
        "org": "USA Badminton",
        "city": "Lewisville",
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-16",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "entries": "enabled", "display": "enabled"},
        "courts": 10,
        # The Entries flagship: these draws are filled by the public entry
        # pipeline (signup -> submit -> confirm -> commit) and only then
        # generated.
        #
        # ``size: 2`` and not 0 because **a draw cannot be created empty** —
        # ``POST /bracket`` refuses "event 'u11' needs at least 2
        # participants", while the commit seam needs the draw to already
        # exist to map an entry onto it. Two direct entries per event is the
        # smallest honest way through that pair of rules; everyone else in
        # these draws arrives through the public form.
        #
        # ``bracket_size`` is declared and not derived, for the third rule in
        # this stack: the draw's size is fixed when the draw is CREATED, so a
        # size derived from two direct entries refuses to generate the moment
        # the entries land ("bracket_size=2 cannot hold 12 participants"). A
        # director sizes the draw for the field they expect; so does this.
        "events": (
            {"id": "u11", "label": "U11 Singles", "code": "U11", "bracket_size": 16,
             "format": "se", "size": 2, "min_year": 2016, "max_year": 2018},
            {"id": "u13", "label": "U13 Singles", "code": "U13", "bracket_size": 16,
             "format": "se", "size": 2, "min_year": 2014, "max_year": 2015},
            {"id": "u15", "label": "U15 Singles", "code": "U15", "bracket_size": 16,
             "format": "se", "size": 2, "min_year": 2012, "max_year": 2013},
            # Four, not two: double elimination refuses a bracket size below
            # 4 ("double elimination needs a bracket size of at least 4"),
            # which is a per-FORMAT floor sitting on top of the per-event one.
            {"id": "u17", "label": "U17 Singles", "code": "U17", "bracket_size": 16,
             "format": "de", "size": 4, "min_year": 2010, "max_year": 2011},
            {"id": "u19", "label": "U19 Singles", "code": "U19", "bracket_size": 16,
             "format": "se", "size": 2, "min_year": 2008, "max_year": 2009},
        ),
        "entries": {
            "slug": "dfw-lewisville-2026",
            "isOpen": True,
            "venueName": "DFW Badminton Center",
            "venueAddress": "1200 Corporate Dr, Lewisville, TX 75067",
            "introText": (
                "Entries for the 2026 YONEX DFW Badminton Lewisville South "
                "Open Regional Championships are open. Junior singles only; "
                "age is taken as of 31 December 2026."
            ),
            "regulationsText": (
                "1. Age eligibility is determined by year of birth.\n"
                "2. Entries close at the deadline shown on this page. "
                "Withdrawals are accepted for three days after that.\n"
                "3. Players must be present 30 minutes before their first "
                "scheduled match.\n"
                "4. The referee's decision on all matters of play is final."
            ),
            "waiverRequired": True,
            # Cumulative totals, the way a price list is published.
            "feeSchedule": {"1": 4500, "2": 7000, "3": 8500},
            "paymentInstructions": (
                "Payment by Zelle to entries@example-dfw-badminton.test, or "
                "cash at the control desk on the first day of play."
            ),
            "maxEventsPerPerson": 3,
            "collectPhone": True,
            # Days from the moment the seeder RUNS, not fixed dates. The
            # owner's tournament dates are February 2026 and are kept
            # verbatim, but an entry window that closed before the demo is
            # played back is a page that refuses every entry with "that
            # event is not taking entries" — the deadline is checked
            # against the wall clock (``_event_is_open``). So the deadline
            # is live and the tournament date is the owner's.
            "closesInDays": 21,
            "withdrawsInDays": 24,
            # Entries land pending; the demo confirms and commits them.
            "workflow": "commit",
        },
        "play": "partial",
    },
    {
        "key": "nashville-doubles",
        "name": "Nashville Doubles Classic 2026 (Internal)",
        "org": "Nashville Badminton Association",
        "city": "Hermitage",
        "date": "2026-02-15",
        "dates": "2026-02-15 to 2026-02-22",
        "kind": "meet",
        # A hybrid workspace: both engines enabled at once, which is the
        # case the module contract exists to keep honest.
        "modules": {"meet": "enabled", "bracket": "enabled", "display": "enabled"},
        "meet": {
            "groups": ("Nashville Badminton Association", "Music City Shuttlers"),
            "ranks": {"MD": 3, "WD": 3, "XD": 2},
            "courts": 4,
            "pool": {"min_year": 1982, "max_year": 2008},
        },
        "courts": 2,
        "events": (
            {"id": "open-a", "label": "Open A Singles", "code": "OA",
             "format": "se", "size": 8, "min_year": 1996, "max_year": 2007},
        ),
        # The Operations flagship: a floor mid-session, with matches in
        # every state at once rather than all finished.
        "play": "spread",
    },
    {
        "key": "dave-freeman-jr",
        "name": "2026 Dave Freeman Jr Open Local Championships",
        "org": "USA Badminton",
        "city": "San Diego",
        "date": "2026-02-20",
        "dates": "2026-02-20 to 2026-02-22",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "entries": "enabled", "display": "enabled"},
        "courts": 8,
        "events": (
            {"id": "u11", "label": "U11 Singles", "code": "U11",
             "format": "se", "size": 8, "min_year": 2016, "max_year": 2018},
            {"id": "u13", "label": "U13 Singles", "code": "U13",
             "format": "se", "size": 8, "min_year": 2014, "max_year": 2015},
            {"id": "u15", "label": "U15 Singles", "code": "U15",
             "format": "se", "size": 8, "min_year": 2012, "max_year": 2013},
            {"id": "u17", "label": "U17 Singles", "code": "U17",
             "format": "se", "size": 8, "min_year": 2010, "max_year": 2011},
            {"id": "u19", "label": "U19 Singles", "code": "U19",
             "format": "se", "size": 8, "min_year": 2008, "max_year": 2009},
        ),
        "entries": {
            "slug": "dave-freeman-jr-2026",
            "isOpen": True,
            "venueName": "Balboa Badminton Center",
            "venueAddress": "2221 Morley Field Dr, San Diego, CA 92104",
            "introText": (
                "The Dave Freeman Jr Open is a local championship for junior "
                "players. Entries are open and reviewed by the tournament "
                "desk before a draw is made."
            ),
            "regulationsText": (
                "1. Players must be members of a club in good standing.\n"
                "2. Entries close 14 February 2026.\n"
                "3. Draws are published 48 hours before play."
            ),
            "waiverRequired": True,
            "feeSchedule": {"1": 3500, "2": 5500},
            "paymentInstructions": "Cash or card at the desk on arrival.",
            "maxEventsPerPerson": 2,
            "collectPhone": False,
            "closesInDays": 14,
            "withdrawsInDays": 17,
            # Entries are left PENDING on purpose — the desk should have a
            # review queue on it, not an empty one.
            "workflow": "pending",
        },
        "play": "none",
    },
    {
        # ---- INVENTED, and marked so ------------------------------------
        # The owner's source list was truncated at this entry: only the
        # workspace name was supplied. The organisation, city, dates and
        # event categories below are a plausible invention consistent with
        # the other seven, NOT data the owner gave.
        "key": "dave-freeman-classic",
        "name": "68th Dave Freeman Classic Open - 2026",
        "org": "USA Badminton",
        "city": "San Diego",
        "date": "2026-03-06",
        "dates": "2026-03-06 to 2026-03-08",
        "invented": True,
        "kind": "bracket",
        # No Display: the fourth distinct module set in the demo.
        "modules": {"bracket": "enabled", "entries": "enabled"},
        "courts": 8,
        "events": (
            {"id": "open-a", "label": "Open A", "code": "OA",
             "format": "se", "size": 16, "min_year": 1990, "max_year": 2008},
            {"id": "open-b", "label": "Open B", "code": "OB",
             "format": "de", "size": 8, "min_year": 1982, "max_year": 2007},
            {"id": "masters-35", "label": "35+", "code": "M35",
             "format": "rr", "size": 8, "min_year": 1982, "max_year": 1991},
            {"id": "masters-50", "label": "50+", "code": "M50",
             "format": "rr", "size": 6, "min_year": 1968, "max_year": 1976},
        ),
        "entries": {
            "slug": "dave-freeman-classic-2026",
            # DELIBERATELY CLOSED — the negative control. A closed page
            # answers a uniform 404 and shows nothing, which is a guard
            # worth seeing work rather than taking on trust.
            "isOpen": False,
            "venueName": "Balboa Badminton Center",
            "venueAddress": "2221 Morley Field Dr, San Diego, CA 92104",
            "introText": "Entries for the 68th Dave Freeman Classic open on 1 February 2026.",
            "regulationsText": "Regulations will be published with the entry form.",
            "waiverRequired": False,
            "feeSchedule": {"1": 5000, "2": 8000},
            "paymentInstructions": "Details to follow.",
            "maxEventsPerPerson": 2,
            "collectPhone": False,
            "closesInDays": None,
            "withdrawsInDays": None,
            "workflow": "closed",
        },
        "play": "none",
    },
)


# ---- operator accounts, one per organisation -----------------------------
#
# The eight workspaces above belong to SIX organisations, and an organisation
# in this product is not a label on a tournament — it is a real ``orgs`` row
# that owns workspaces (``tournaments.org_id``), created for a user the moment
# they register (``services/auth.ensure_personal_org``). So the way to seed
# six organisations is to register six operators and have each of them create
# their own events: a director then signs in and the Hub shows exactly the
# workspaces their org owns, because that is the only set the API will return.
#
# ``displayName`` is the organisation's own name, because the org row is named
# after it (``f"{display_name}'s workspace"``). There is no route that renames
# an org — the UI ignores org names entirely today — so this is as close as the
# HTTP surface gets, and inventing a route to make a demo prettier is exactly
# what the simulator's boundary exists to prevent.
#
# Under ``AUTH_MODE=local`` none of this is used: the deployment resolves every
# credential-less request to the bootstrap operator and the scenario asks the
# API which world it is in rather than being configured for one.

OPERATOR_PASSWORD = "DemoOperator2026!"

OPERATORS: dict[str, dict] = {
    "F & K Tournaments": {
        "email": "director@fk-tournaments.example.test",
        "displayName": "F & K Tournaments",
    },
    "The Bellevue Badminton Club": {
        "email": "director@bellevue-badminton.example.test",
        "displayName": "The Bellevue Badminton Club",
    },
    "California Badminton": {
        "email": "director@california-badminton.example.test",
        "displayName": "California Badminton",
    },
    "Michigan Badminton Club": {
        "email": "director@michigan-badminton.example.test",
        "displayName": "Michigan Badminton Club",
    },
    "USA Badminton": {
        "email": "director@usa-badminton.example.test",
        "displayName": "USA Badminton",
    },
    "Nashville Badminton Association": {
        "email": "director@nashville-badminton.example.test",
        "displayName": "Nashville Badminton Association",
    },
}


# ---- entrant accounts ----------------------------------------------------
#
# Six accounts, not sixty: ``entrant_signup_max_per_ip`` is 8 per hour from
# one address and this seeder is one address. They are shaped as the real
# submitters are — parents entering their own children, club secretaries
# entering a squad — because that is what makes the desk's submission
# grouping mean anything.

ENTRANT_PASSWORD = "DemoEntrant2026!"

ENTRANTS: tuple[dict, ...] = (
    {"email": "coach.reyes@example.test", "displayName": "Coach Marisela Reyes",
     "phone": "+1 555 0142", "role": "club secretary"},
    {"email": "n.okonjo@example.test", "displayName": "Nkechi Okonjo",
     "phone": "+1 555 0198", "role": "parent"},
    {"email": "d.balakrishnan@example.test", "displayName": "Divya Balakrishnan",
     "phone": "+1 555 0233", "role": "parent"},
    {"email": "hq@dallas-academy.example.test", "displayName": "Dallas Badminton Academy",
     "phone": "+1 555 0311", "role": "club secretary"},
    {"email": "j.matsuda@example.test", "displayName": "Jun Matsuda",
     "phone": "+1 555 0377", "role": "parent"},
    {"email": "desk@houston-shuttle.example.test", "displayName": "Houston Shuttle Club",
     "phone": "+1 555 0402", "role": "club secretary"},
)


def chunk(items: Sequence, size: int) -> list[list]:
    """``items`` split into runs of at most ``size``.

    One submission carries 1-N players (a club secretary enters a squad),
    which is both the realistic shape and the only way ~40 entrants fit
    inside ``entries_max_per_ip`` — 20 submissions per 10 minutes from one
    address. Going around that budget was never on the table; the budget is
    sized for exactly this use.
    """
    return [list(items[i:i + size]) for i in range(0, len(items), size)]
