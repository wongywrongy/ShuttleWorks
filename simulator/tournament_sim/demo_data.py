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
**516 named people** with a gender, a birth year and a club, spread over 22
clubs, and the workspaces draw from it by eligibility — so a strong junior
turns up at three events on the circuit because the same rows are eligible
for all three, not because anything wired them together.

**Clubs are shaped, not sprinkled.** Two of the 22 are junior academies
with 36 juniors each (they field the two squads of the F&K league), two are
Nashville-area clubs whose members are all 1986–1995 (they field the two
squads of the Nashville doubles meet, and that band is deliberately
disjoint from the 1996–2007 band its *bracket* draws from, so nobody is on
two courts at once inside one workspace). The other 18 carry a full 22-row
age ladder each.

Genders and clubs only reach the database through the **Entries** pipeline
(``entry_players`` carries both); Meet's ``PlayerDTO`` and Bracket's
``BracketPlayerDTO`` have no such columns, so on a roster the club rides in
``notes``. That asymmetry is the product's, not this file's.
"""
from __future__ import annotations

from typing import Optional, Sequence

from .rng import derive_rng

# ---- the player pool -----------------------------------------------------
# (full name, gender, birth year, club). Birth years are the eligibility
# field R12 describes — a plain number, never a trigger for behaviour.
# Tournament year is 2026 throughout, so U11 means born 2016 or later.
#
# Age bands used by the workspaces below (all "as of 31 Dec 2026"):
#   U11 2016-2018   U13 2014-2015   U15 2012-2013   U17 2010-2011
#   U19 2008-2009   Open 1996-2007  35+ 1982-1991   50+ 1968-1976

PLAYERS: tuple[tuple[str, str, int, str], ...] = (
    # ================= Fremont Badminton Academy (36 juniors) =============
    # A junior academy: one of the two squads in the F&K Winter League.
    # 6 boys + 6 girls in each of U11 / U13 / U15.
    ("Aiden Nakamura", "M", 2017, "Fremont Badminton Academy"),
    ("Dylan Marchetti", "M", 2016, "Fremont Badminton Academy"),
    ("Rohan Balakrishnan", "M", 2016, "Fremont Badminton Academy"),
    ("Caleb Okonjo", "M", 2017, "Fremont Badminton Academy"),
    ("Julian Ocampo", "M", 2018, "Fremont Badminton Academy"),
    ("Tobias Wen", "M", 2018, "Fremont Badminton Academy"),
    ("Sofia Ramirez", "F", 2017, "Fremont Badminton Academy"),
    ("Anika Deshmukh", "F", 2017, "Fremont Badminton Academy"),
    ("Ivy Tran", "F", 2016, "Fremont Badminton Academy"),
    ("Leila Brahimi", "F", 2018, "Fremont Badminton Academy"),
    ("Maya Cardoso", "F", 2018, "Fremont Badminton Academy"),
    ("Hannah Yousef", "F", 2016, "Fremont Badminton Academy"),
    ("Lucas Meireles", "M", 2014, "Fremont Badminton Academy"),
    ("Arjun Venkatesan", "M", 2015, "Fremont Badminton Academy"),
    ("Felix Andersen", "M", 2014, "Fremont Badminton Academy"),
    ("Gabriel Osei-Bonsu", "M", 2014, "Fremont Badminton Academy"),
    ("Simon Vasquez", "M", 2015, "Fremont Badminton Academy"),
    ("Rayan Chaudhri", "M", 2015, "Fremont Badminton Academy"),
    ("Isabella Cheng", "F", 2014, "Fremont Badminton Academy"),
    ("Nora Abdulrahman", "F", 2015, "Fremont Badminton Academy"),
    ("Camila Estrada", "F", 2014, "Fremont Badminton Academy"),
    ("Riya Chandrasekar", "F", 2015, "Fremont Badminton Academy"),
    ("Yuki Matsuda", "F", 2014, "Fremont Badminton Academy"),
    ("Aline Duprez", "F", 2015, "Fremont Badminton Academy"),
    ("Marcus Delacroix", "M", 2012, "Fremont Badminton Academy"),
    ("Devin Aluwihare", "M", 2013, "Fremont Badminton Academy"),
    ("Idris Bello", "M", 2012, "Fremont Badminton Academy"),
    ("Theo Vasquez", "M", 2013, "Fremont Badminton Academy"),
    ("Karan Mehrotra", "M", 2012, "Fremont Badminton Academy"),
    ("Nils Blomqvist", "M", 2013, "Fremont Badminton Academy"),
    ("Elena Petrovic", "F", 2012, "Fremont Badminton Academy"),
    ("Freya Lindholm", "F", 2013, "Fremont Badminton Academy"),
    ("Naomi Sasaki", "F", 2012, "Fremont Badminton Academy"),
    ("Aisha Rahimi", "F", 2013, "Fremont Badminton Academy"),
    ("Clara Bjornsen", "F", 2013, "Fremont Badminton Academy"),
    ("Lin Xiaowen", "F", 2012, "Fremont Badminton Academy"),
    # ================= Milpitas Youth BC (36 juniors) =====================
    # The other F&K league squad.
    ("Ethan Chowdhury", "M", 2018, "Milpitas Youth BC"),
    ("Noah Villanueva", "M", 2018, "Milpitas Youth BC"),
    ("Mateo Salcedo", "M", 2016, "Milpitas Youth BC"),
    ("Kenji Watanabe", "M", 2016, "Milpitas Youth BC"),
    ("Owen Lindqvist", "M", 2017, "Milpitas Youth BC"),
    ("Samir Haddad", "M", 2017, "Milpitas Youth BC"),
    ("Mia Fernandes", "F", 2018, "Milpitas Youth BC"),
    ("Priya Raghunathan", "F", 2016, "Milpitas Youth BC"),
    ("Elise Kwon", "F", 2018, "Milpitas Youth BC"),
    ("Zara Haddadi", "F", 2016, "Milpitas Youth BC"),
    ("Hana Yoshida", "F", 2017, "Milpitas Youth BC"),
    ("Amara Nwosu", "F", 2017, "Milpitas Youth BC"),
    ("Sebastian Duarte", "M", 2015, "Milpitas Youth BC"),
    ("Nathan Ibarra", "M", 2014, "Milpitas Youth BC"),
    ("Emeka Adeyemi", "M", 2015, "Milpitas Youth BC"),
    ("Jasper Lindholm", "M", 2014, "Milpitas Youth BC"),
    ("Yusuf Bhatti", "M", 2015, "Milpitas Youth BC"),
    ("Andre Sepulveda", "M", 2014, "Milpitas Youth BC"),
    ("Sana Qureshi", "F", 2015, "Milpitas Youth BC"),
    ("Emilia Novak", "F", 2014, "Milpitas Youth BC"),
    ("Aditi Ramaswamy", "F", 2015, "Milpitas Youth BC"),
    ("Chiara Bellucci", "F", 2014, "Milpitas Youth BC"),
    ("Rina Takahashi", "F", 2015, "Milpitas Youth BC"),
    ("Zoe Ferreira", "F", 2014, "Milpitas Youth BC"),
    ("Tobias Reinhardt", "M", 2013, "Milpitas Youth BC"),
    ("Hugo Salcedo", "M", 2012, "Milpitas Youth BC"),
    ("Micah Oyelaran", "M", 2013, "Milpitas Youth BC"),
    ("Aryan Deshpande", "M", 2012, "Milpitas Youth BC"),
    ("Callum Whitaker", "M", 2013, "Milpitas Youth BC"),
    ("Leon Mikkelsen", "M", 2012, "Milpitas Youth BC"),
    ("Saanvi Iyer", "F", 2013, "Milpitas Youth BC"),
    ("Beatriz Almeida", "F", 2012, "Milpitas Youth BC"),
    ("Mira Sandoval", "F", 2013, "Milpitas Youth BC"),
    ("Keira O'Donnell", "F", 2012, "Milpitas Youth BC"),
    ("Ayaka Nishimura", "F", 2013, "Milpitas Youth BC"),
    ("Salma Bouzid", "F", 2012, "Milpitas Youth BC"),
    # ============ Nashville Badminton Association (24 adults) =============
    # Deliberately all 1986-1995: the Nashville workspace's MEET draws its
    # two squads from these two clubs, while its BRACKET draws from the
    # 1996-2007 band — disjoint, so nobody is scheduled by two engines at
    # once inside one workspace.
    ("Emmanuel Bakayoko", "M", 1990, "Nashville Badminton Association"),
    ("Marek Zielinski", "M", 1992, "Nashville Badminton Association"),
    ("Trevor Lindgren", "M", 1988, "Nashville Badminton Association"),
    ("Rahul Nandakumar", "M", 1994, "Nashville Badminton Association"),
    ("Joel Kirkpatrick", "M", 1987, "Nashville Badminton Association"),
    ("Diego Alcantara", "M", 1991, "Nashville Badminton Association"),
    ("Tomas Havel", "M", 1993, "Nashville Badminton Association"),
    ("Bryce Whitmore", "M", 1986, "Nashville Badminton Association"),
    ("Kwame Boateng", "M", 1995, "Nashville Badminton Association"),
    ("Shinji Morikawa", "M", 1989, "Nashville Badminton Association"),
    ("Patrick Considine", "M", 1992, "Nashville Badminton Association"),
    ("Amir Fakhouri", "M", 1994, "Nashville Badminton Association"),
    ("Tara Brennan", "F", 1990, "Nashville Badminton Association"),
    ("Aurora Pellegrini", "F", 1993, "Nashville Badminton Association"),
    ("Nadine Okafor", "F", 1988, "Nashville Badminton Association"),
    ("Shruti Kalyanaraman", "F", 1991, "Nashville Badminton Association"),
    ("Caitlin Doherty", "F", 1986, "Nashville Badminton Association"),
    ("Mai Sugiyama", "F", 1995, "Nashville Badminton Association"),
    ("Larissa Wolter", "F", 1989, "Nashville Badminton Association"),
    ("Paloma Restrepo", "F", 1992, "Nashville Badminton Association"),
    ("Fiona Ballantyne", "F", 1987, "Nashville Badminton Association"),
    ("Hyeon Seo Lim", "F", 1994, "Nashville Badminton Association"),
    ("Blessing Adeleke", "F", 1990, "Nashville Badminton Association"),
    ("Roxana Ionescu", "F", 1993, "Nashville Badminton Association"),
    # ================= Music City Shuttlers (24 adults) ===================
    ("Grant Overbeck", "M", 1989, "Music City Shuttlers"),
    ("Sanjay Puttaswamy", "M", 1993, "Music City Shuttlers"),
    ("Elliot Rankin", "M", 1986, "Music City Shuttlers"),
    ("Hakim Ouedraogo", "M", 1991, "Music City Shuttlers"),
    ("Wesley Trumbull", "M", 1995, "Music City Shuttlers"),
    ("Rafael Quiroga", "M", 1988, "Music City Shuttlers"),
    ("Damon Ferraro", "M", 1992, "Music City Shuttlers"),
    ("Chen Wei Liang", "M", 1990, "Music City Shuttlers"),
    ("Isaac Steinmetz", "M", 1994, "Music City Shuttlers"),
    ("Baptiste Moreau", "M", 1987, "Music City Shuttlers"),
    ("Tyrell Beauchamp", "M", 1991, "Music City Shuttlers"),
    ("Nikola Zdravkovic", "M", 1993, "Music City Shuttlers"),
    ("Kendra Ashworth", "F", 1990, "Music City Shuttlers"),
    ("Yolanda Espinoza", "F", 1994, "Music City Shuttlers"),
    ("Bethany Crowder", "F", 1987, "Music City Shuttlers"),
    ("Manasi Kulkarni", "F", 1992, "Music City Shuttlers"),
    ("Solveig Nyland", "F", 1989, "Music City Shuttlers"),
    ("Camille Beaudoin", "F", 1995, "Music City Shuttlers"),
    ("Rachel Vandermeer", "F", 1986, "Music City Shuttlers"),
    ("Ngozi Chukwuma", "F", 1991, "Music City Shuttlers"),
    ("Erika Halloran", "F", 1993, "Music City Shuttlers"),
    ("Sun Hee Jang", "F", 1988, "Music City Shuttlers"),
    ("Valeria Montoya", "F", 1994, "Music City Shuttlers"),
    ("Astrid Kvamme", "F", 1990, "Music City Shuttlers"),
    # ================= Bay Badminton Center (22) ==========================
    ("Rohan Iyer", "M", 2017, "Bay Badminton Center"),
    ("Serena Kwok", "F", 2016, "Bay Badminton Center"),
    ("Nikhil Ranganathan", "M", 2015, "Bay Badminton Center"),
    ("Talia Mendez", "F", 2014, "Bay Badminton Center"),
    ("Kenta Shimizu", "M", 2012, "Bay Badminton Center"),
    ("Ingrid Halvorsen", "F", 2013, "Bay Badminton Center"),
    ("Nathaniel Ortega", "M", 2010, "Bay Badminton Center"),
    ("Bilal Nazir", "M", 2011, "Bay Badminton Center"),
    ("Tanvi Bhattacharya", "F", 2010, "Bay Badminton Center"),
    ("Andres Quintanilla", "M", 2008, "Bay Badminton Center"),
    ("Viktor Novotny", "M", 2009, "Bay Badminton Center"),
    ("Meera Sundaram", "F", 2008, "Bay Badminton Center"),
    ("Vikram Anantharaman", "M", 1997, "Bay Badminton Center"),
    ("Nikhil Ramanathan", "M", 2003, "Bay Badminton Center"),
    ("Desmond Achebe", "M", 2006, "Bay Badminton Center"),
    ("Wei-Lin Chang", "F", 1998, "Bay Badminton Center"),
    ("Bianca Costanzo", "F", 2002, "Bay Badminton Center"),
    ("Priyanka Doshi", "F", 2005, "Bay Badminton Center"),
    ("Anand Krishnamurthy", "M", 1984, "Bay Badminton Center"),
    ("Michelle Lauzon", "F", 1985, "Bay Badminton Center"),
    ("Gordon Feathersby", "M", 1970, "Bay Badminton Center"),
    ("Junko Hayashida", "F", 1974, "Bay Badminton Center"),
    # ================= California Badminton (22) ==========================
    ("Dashiell Ortiz", "M", 2016, "California Badminton"),
    ("Nell Kavanagh", "F", 2018, "California Badminton"),
    ("Bodhi Ramachandran", "M", 2014, "California Badminton"),
    ("Kaia Lindstrom", "F", 2015, "California Badminton"),
    ("Hassan Toure", "M", 2013, "California Badminton"),
    ("Selena Marchetti", "F", 2012, "California Badminton"),
    ("Damian Kowalczyk", "M", 2011, "California Badminton"),
    ("Ryan Alsaadi", "M", 2010, "California Badminton"),
    ("Emi Kurosawa", "F", 2011, "California Badminton"),
    ("Ibrahim Chaudhry", "M", 2009, "California Badminton"),
    ("Peter Lindgren", "M", 2008, "California Badminton"),
    ("Jasmine Oyelaran", "F", 2009, "California Badminton"),
    ("Hasan Demirkol", "M", 2001, "California Badminton"),
    ("Jonah Ellsworth", "M", 2004, "California Badminton"),
    ("Marcus Oyelowo", "M", 2007, "California Badminton"),
    ("Ji-Woo Park", "F", 2000, "California Badminton"),
    ("Thandiwe Moyo", "F", 2003, "California Badminton"),
    ("Estela Villarreal", "F", 2006, "California Badminton"),
    ("Rodrigo Serrano", "M", 1988, "California Badminton"),
    ("Margaret Okoro", "F", 1990, "California Badminton"),
    ("Hector Palomino", "M", 1969, "California Badminton"),
    ("Bettina Kraus", "F", 1972, "California Badminton"),
    # ================= Synergy Badminton Academy (22) =====================
    ("Ravi Thangavelu", "M", 2018, "Synergy Badminton Academy"),
    ("Amelie Bourgeois", "F", 2017, "Synergy Badminton Academy"),
    ("Kian Motlagh", "M", 2014, "Synergy Badminton Academy"),
    ("Sienna Delgado", "F", 2015, "Synergy Badminton Academy"),
    ("Anders Fossum", "M", 2013, "Synergy Badminton Academy"),
    ("Priyasha Nair", "F", 2012, "Synergy Badminton Academy"),
    ("Joshua Wanjiru", "M", 2010, "Synergy Badminton Academy"),
    ("Hugo Lefevre", "M", 2011, "Synergy Badminton Academy"),
    ("Marta Sokolova", "F", 2011, "Synergy Badminton Academy"),
    ("Samuel Mwangi", "M", 2008, "Synergy Badminton Academy"),
    ("Nathan Broussard", "M", 2009, "Synergy Badminton Academy"),
    ("Chloe Baptiste", "F", 2008, "Synergy Badminton Academy"),
    ("Daniel Sittipong", "M", 1998, "Synergy Badminton Academy"),
    ("Aarav Pattabhiraman", "M", 2002, "Synergy Badminton Academy"),
    ("Ellis Wainwright", "M", 2005, "Synergy Badminton Academy"),
    ("Grace Halvorsen", "F", 1999, "Synergy Badminton Academy"),
    ("Sunita Chaudhary", "F", 2002, "Synergy Badminton Academy"),
    ("Noelia Cabrera", "F", 2007, "Synergy Badminton Academy"),
    ("Piotr Wysocki", "M", 1985, "Synergy Badminton Academy"),
    ("Deepa Venkataraman", "F", 1983, "Synergy Badminton Academy"),
    ("Alistair Fenwick", "M", 1973, "Synergy Badminton Academy"),
    ("Lucia Barrera", "F", 1968, "Synergy Badminton Academy"),
    # ================= Peninsula Shuttle Club (22) ========================
    ("Milo Aranda", "M", 2017, "Peninsula Shuttle Club"),
    ("Farah Zaidi", "F", 2016, "Peninsula Shuttle Club"),
    ("Corey Nakashima", "M", 2015, "Peninsula Shuttle Club"),
    ("Alina Grabowski", "F", 2014, "Peninsula Shuttle Club"),
    ("Zaid Al-Hamadi", "M", 2012, "Peninsula Shuttle Club"),
    ("Emily Vandenberg", "F", 2013, "Peninsula Shuttle Club"),
    ("Trenton Beckley", "M", 2011, "Peninsula Shuttle Club"),
    ("Kabir Sondhi", "M", 2010, "Peninsula Shuttle Club"),
    ("Noemi Castellanos", "F", 2011, "Peninsula Shuttle Club"),
    ("Rafferty Doyle", "M", 2009, "Peninsula Shuttle Club"),
    ("Omar Belkacem", "M", 2008, "Peninsula Shuttle Club"),
    ("Sabine Trittenbach", "F", 2009, "Peninsula Shuttle Club"),
    ("Oliver Ashbourne", "M", 2000, "Peninsula Shuttle Club"),
    ("Tao Ming Zhu", "M", 2004, "Peninsula Shuttle Club"),
    ("Julien Mercier", "M", 2006, "Peninsula Shuttle Club"),
    ("Renata Vasconcelos", "F", 2001, "Peninsula Shuttle Club"),
    ("Anjali Ramesh", "F", 2004, "Peninsula Shuttle Club"),
    ("Nina Petkovic", "F", 2007, "Peninsula Shuttle Club"),
    ("Frederick Ashland", "M", 1982, "Peninsula Shuttle Club"),
    ("Maryam Sultani", "F", 1987, "Peninsula Shuttle Club"),
    ("Warren Gillespie", "M", 1975, "Peninsula Shuttle Club"),
    ("Constance Mbeki", "F", 1971, "Peninsula Shuttle Club"),
    # ================= Bellevue Badminton Club (22) =======================
    ("Soren Ellingsen", "M", 2016, "Bellevue Badminton Club"),
    ("Poppy Nakagawa", "F", 2018, "Bellevue Badminton Club"),
    ("Advait Sharma", "M", 2014, "Bellevue Badminton Club"),
    ("Winona Ferrell", "F", 2015, "Bellevue Badminton Club"),
    ("Griffin Halsey", "M", 2012, "Bellevue Badminton Club"),
    ("Anaya Bhandari", "F", 2013, "Bellevue Badminton Club"),
    ("Dominic Cardoza", "M", 2010, "Bellevue Badminton Club"),
    ("Rustam Yusupov", "M", 2011, "Bellevue Badminton Club"),
    ("Petra Simunek", "F", 2010, "Bellevue Badminton Club"),
    ("Callahan Reeves", "M", 2008, "Bellevue Badminton Club"),
    ("Zayn Abbasi", "M", 2009, "Bellevue Badminton Club"),
    ("Mariam Diallo", "F", 2008, "Bellevue Badminton Club"),
    ("Kenzo Fujimoto", "M", 2004, "Bellevue Badminton Club"),
    ("Bryan Whitcombe", "M", 1999, "Bellevue Badminton Club"),
    ("Suraj Mahadevan", "M", 2006, "Bellevue Badminton Club"),
    ("Marisol Herrera", "F", 2004, "Bellevue Badminton Club"),
    ("Annika Sorenstam-Ek", "F", 1997, "Bellevue Badminton Club"),
    ("Leilani Kahale", "F", 2003, "Bellevue Badminton Club"),
    ("Stefan Groenewald", "M", 1982, "Bellevue Badminton Club"),
    ("Hyun-Ji Baek", "F", 1991, "Bellevue Badminton Club"),
    ("Douglas Pemberton", "M", 1968, "Bellevue Badminton Club"),
    ("Rosalind Cheung", "F", 1976, "Bellevue Badminton Club"),
    # ================= Seattle Smash BC (22) ==============================
    ("Bastian Kohler", "M", 2018, "Seattle Smash BC"),
    ("Juniper Okafor", "F", 2016, "Seattle Smash BC"),
    ("Emiliano Rosas", "M", 2015, "Seattle Smash BC"),
    ("Thea Brandvold", "F", 2014, "Seattle Smash BC"),
    ("Krish Vaidyanathan", "M", 2013, "Seattle Smash BC"),
    ("Lorelei Mancini", "F", 2012, "Seattle Smash BC"),
    ("Xavier Boone", "M", 2011, "Seattle Smash BC"),
    ("Tarek Mansour", "M", 2010, "Seattle Smash BC"),
    ("Sunniva Aalborg", "F", 2011, "Seattle Smash BC"),
    ("Lachlan Prescott", "M", 2009, "Seattle Smash BC"),
    ("Idrissa Camara", "M", 2008, "Seattle Smash BC"),
    ("Rebeka Toth", "F", 2009, "Seattle Smash BC"),
    ("Alexei Sorokin", "M", 2005, "Seattle Smash BC"),
    ("Fionn Gallagher", "M", 2000, "Seattle Smash BC"),
    ("Rishi Balasubramanian", "M", 2003, "Seattle Smash BC"),
    ("Ingrid Solberg", "F", 2005, "Seattle Smash BC"),
    ("Malia Tupou", "F", 1999, "Seattle Smash BC"),
    ("Daniela Cortes", "F", 2002, "Seattle Smash BC"),
    ("Lucas Wiedemann", "M", 1990, "Seattle Smash BC"),
    ("Fatima Bensalem", "F", 1986, "Seattle Smash BC"),
    ("Neil Ravensworth", "M", 1972, "Seattle Smash BC"),
    ("Sylvia Brandt", "F", 1969, "Seattle Smash BC"),
    # ================= Portland Feathers BC (22) ==========================
    ("Wilder Marchetti", "M", 2017, "Portland Feathers BC"),
    ("Odette Lamothe", "F", 2017, "Portland Feathers BC"),
    ("Jonas Kilbride", "M", 2014, "Portland Feathers BC"),
    ("Iris Nakamura", "F", 2015, "Portland Feathers BC"),
    ("Sacha Delcroix", "M", 2012, "Portland Feathers BC"),
    ("Rosalie Fontenot", "F", 2013, "Portland Feathers BC"),
    ("Everett Coleridge", "M", 2010, "Portland Feathers BC"),
    ("Vikas Ramanujan", "M", 2011, "Portland Feathers BC"),
    ("Delphine Rousseau", "F", 2010, "Portland Feathers BC"),
    ("Bodie Kilpatrick", "M", 2008, "Portland Feathers BC"),
    ("Sohail Rahmani", "M", 2009, "Portland Feathers BC"),
    ("Marguerite Aubert", "F", 2008, "Portland Feathers BC"),
    ("Colin Macgregor", "M", 1996, "Portland Feathers BC"),
    ("Lars Hovden", "M", 2001, "Portland Feathers BC"),
    ("Theodore Ashcombe", "M", 2005, "Portland Feathers BC"),
    ("Adaeze Ikenna", "F", 1996, "Portland Feathers BC"),
    ("Noor Al-Mansouri", "F", 2001, "Portland Feathers BC"),
    ("Imogen Fairweather", "F", 2006, "Portland Feathers BC"),
    ("Tomasz Wisniewski", "M", 1989, "Portland Feathers BC"),
    ("Petra Havlickova", "F", 1984, "Portland Feathers BC"),
    ("Raymond Fitzgerald", "M", 1971, "Portland Feathers BC"),
    ("Yvonne Delacour", "F", 1975, "Portland Feathers BC"),
    # ================= Tacoma Badminton Club (22) =========================
    ("Kingsley Amaro", "M", 2016, "Tacoma Badminton Club"),
    ("Wren Kobayashi", "F", 2018, "Tacoma Badminton Club"),
    ("Dominik Pavlik", "M", 2015, "Tacoma Badminton Club"),
    ("Estelle Marchand", "F", 2014, "Tacoma Badminton Club"),
    ("Rasheed Olatunji", "M", 2012, "Tacoma Badminton Club"),
    ("Marisa Contreras", "F", 2013, "Tacoma Badminton Club"),
    ("Beckett Lyall", "M", 2011, "Tacoma Badminton Club"),
    ("Anwar Sheikh", "M", 2010, "Tacoma Badminton Club"),
    ("Hina Yamaguchi", "F", 2011, "Tacoma Badminton Club"),
    ("Corbin Vasseur", "M", 2008, "Tacoma Badminton Club"),
    ("Pranav Sriram", "M", 2009, "Tacoma Badminton Club"),
    ("Elodie Charbonneau", "F", 2009, "Tacoma Badminton Club"),
    ("Ronan Kavanaugh", "M", 1998, "Tacoma Badminton Club"),
    ("Yosef Mizrahi", "M", 2003, "Tacoma Badminton Club"),
    ("Terence Ashby", "M", 2007, "Tacoma Badminton Club"),
    ("Keiko Arimura", "F", 1998, "Tacoma Badminton Club"),
    ("Rosalia Ferrante", "F", 2002, "Tacoma Badminton Club"),
    ("Anastasia Vlahos", "F", 2006, "Tacoma Badminton Club"),
    ("Marcin Dabrowski", "M", 1991, "Tacoma Badminton Club"),
    ("Cristina Mendoza", "F", 1988, "Tacoma Badminton Club"),
    ("Barrett Holloway", "M", 1976, "Tacoma Badminton Club"),
    ("Ingeborg Mathisen", "F", 1970, "Tacoma Badminton Club"),
    # ================= Dallas Badminton Academy (22) ======================
    ("Ezra Whitcomb", "M", 2017, "Dallas Badminton Academy"),
    ("Kavya Srinivasan", "F", 2016, "Dallas Badminton Academy"),
    ("Malik Oyelaran", "M", 2014, "Dallas Badminton Academy"),
    ("Juliette Marchesi", "F", 2015, "Dallas Badminton Academy"),
    ("Ronin Takeda", "M", 2013, "Dallas Badminton Academy"),
    ("Adaora Ekwueme", "F", 2012, "Dallas Badminton Academy"),
    ("Braden Kirkwood", "M", 2010, "Dallas Badminton Academy"),
    ("Zubair Kazmi", "M", 2011, "Dallas Badminton Academy"),
    ("Sloane Radcliffe", "F", 2010, "Dallas Badminton Academy"),
    ("Kellan Voss", "M", 2008, "Dallas Badminton Academy"),
    ("Nirvaan Sethi", "M", 2009, "Dallas Badminton Academy"),
    ("Talia Rosenfeld", "F", 2008, "Dallas Badminton Academy"),
    ("Preston Achterberg", "M", 1997, "Dallas Badminton Academy"),
    ("Karthik Subramanian", "M", 2002, "Dallas Badminton Academy"),
    ("Emeka Nwachukwu", "M", 2005, "Dallas Badminton Academy"),
    ("Saoirse Duignan", "F", 2000, "Dallas Badminton Academy"),
    ("Lucia Ferrante", "F", 2003, "Dallas Badminton Academy"),
    ("Mina Sadeghi", "F", 2006, "Dallas Badminton Academy"),
    ("Gerald Thibodeaux", "M", 1987, "Dallas Badminton Academy"),
    ("Anneliese Wagner", "F", 1982, "Dallas Badminton Academy"),
    ("Clifford Vanterpool", "M", 1974, "Dallas Badminton Academy"),
    ("Marguerite Okonkwo", "F", 1968, "Dallas Badminton Academy"),
    # ================= Houston Shuttle Club (22) ==========================
    ("Idris Gallagher", "M", 2018, "Houston Shuttle Club"),
    ("Anaisha Pillai", "F", 2017, "Houston Shuttle Club"),
    ("Tomas Escalante", "M", 2014, "Houston Shuttle Club"),
    ("Bryony Fairchild", "F", 2015, "Houston Shuttle Club"),
    ("Kofi Mensah", "M", 2012, "Houston Shuttle Club"),
    ("Liv Sandberg", "F", 2013, "Houston Shuttle Club"),
    ("Marco Cifuentes", "M", 2011, "Houston Shuttle Club"),
    ("Devansh Kapadia", "M", 2010, "Houston Shuttle Club"),
    ("Ines Bouchard", "F", 2011, "Houston Shuttle Club"),
    ("Elias Vondracek", "M", 2009, "Houston Shuttle Club"),
    ("Jamal Abdelnour", "M", 2008, "Houston Shuttle Club"),
    ("Simone Delacroix", "F", 2008, "Houston Shuttle Club"),
    ("Farhan Siddiqui", "M", 1999, "Houston Shuttle Club"),
    ("Roberto Villalobos", "M", 2004, "Houston Shuttle Club"),
    ("Chase Templeton", "M", 2007, "Houston Shuttle Club"),
    ("Amaris Whitfield", "F", 1997, "Houston Shuttle Club"),
    ("Divya Krishnamoorthy", "F", 2001, "Houston Shuttle Club"),
    ("Elif Kaya", "F", 2005, "Houston Shuttle Club"),
    ("Olusegun Adebayo", "M", 1989, "Houston Shuttle Club"),
    ("Katarzyna Lewandowska", "F", 1985, "Houston Shuttle Club"),
    ("Desmond Ferriday", "M", 1969, "Houston Shuttle Club"),
    ("Beverly Nakashima", "F", 1973, "Houston Shuttle Club"),
    # ================= Austin Badminton Club (22) =========================
    ("Rowan Escobedo", "M", 2016, "Austin Badminton Club"),
    ("Meilin Zhao", "F", 2018, "Austin Badminton Club"),
    ("Jax Pemberton", "M", 2015, "Austin Badminton Club"),
    ("Ndidi Onyekwere", "F", 2014, "Austin Badminton Club"),
    ("Soham Bhattacharjee", "M", 2013, "Austin Badminton Club"),
    ("Georgia Whitlock", "F", 2012, "Austin Badminton Club"),
    ("Nadir Bouazza", "M", 2010, "Austin Badminton Club"),
    ("Colton Reyes", "M", 2011, "Austin Badminton Club"),
    ("Nadia Popov", "F", 2011, "Austin Badminton Club"),
    ("Emiliano Cardenas", "M", 2008, "Austin Badminton Club"),
    ("Harshith Reddy", "M", 2009, "Austin Badminton Club"),
    ("Josephine Okwudili", "F", 2009, "Austin Badminton Club"),
    ("Ravi Muthukrishnan", "M", 2002, "Austin Badminton Club"),
    ("Beckham Ordonez", "M", 1997, "Austin Badminton Club"),
    ("Jae Hyun Choi", "M", 2006, "Austin Badminton Club"),
    ("Sofie Aagaard", "F", 2002, "Austin Badminton Club"),
    ("Priyanshi Bhargava", "F", 1999, "Austin Badminton Club"),
    ("Carmen Solis", "F", 2005, "Austin Badminton Club"),
    ("Gregory Whitfield", "M", 1986, "Austin Badminton Club"),
    ("Rosa Villanueva-Marin", "F", 1990, "Austin Badminton Club"),
    ("Thaddeus Blackwood", "M", 1970, "Austin Badminton Club"),
    ("Ilse Vandeveld", "F", 1976, "Austin Badminton Club"),
    # ================= Lewisville Badminton Club (22) =====================
    ("Emerson Whitlow", "M", 2017, "Lewisville Badminton Club"),
    ("Aarna Chaturvedi", "F", 2016, "Lewisville Badminton Club"),
    ("Luka Petrusic", "M", 2015, "Lewisville Badminton Club"),
    ("Halle Broussard", "F", 2014, "Lewisville Badminton Club"),
    ("Obinna Uzoma", "M", 2012, "Lewisville Badminton Club"),
    ("Sana Farooqi", "F", 2013, "Lewisville Badminton Club"),
    ("Chandler Voight", "M", 2010, "Lewisville Badminton Club"),
    ("Yohan Perera", "M", 2011, "Lewisville Badminton Club"),
    ("Brielle Santangelo", "F", 2010, "Lewisville Badminton Club"),
    ("Roman Wojciechowski", "M", 2008, "Lewisville Badminton Club"),
    ("Ansh Bhardwaj", "M", 2009, "Lewisville Badminton Club"),
    ("Georgina Pemberley", "F", 2008, "Lewisville Badminton Club"),
    ("Santiago Belmonte", "M", 1999, "Lewisville Badminton Club"),
    ("Trey Alderman", "M", 2003, "Lewisville Badminton Club"),
    ("Aniruddh Venugopal", "M", 2006, "Lewisville Badminton Club"),
    ("Cecile Marchetti", "F", 1998, "Lewisville Badminton Club"),
    ("Oluchi Nwankwo", "F", 2002, "Lewisville Badminton Club"),
    ("Hattie Lindquist", "F", 2007, "Lewisville Badminton Club"),
    ("Vincent Okorafor", "M", 1983, "Lewisville Badminton Club"),
    ("Simona Draganescu", "F", 1989, "Lewisville Badminton Club"),
    ("Roland Beauchesne", "M", 1973, "Lewisville Badminton Club"),
    ("Priscilla Tanaka", "F", 1971, "Lewisville Badminton Club"),
    # ================= San Antonio Racquet Club (22) ======================
    ("Alfonso Zamarripa", "M", 2018, "San Antonio Racquet Club"),
    ("Delaney Whitcroft", "F", 2017, "San Antonio Racquet Club"),
    ("Ishaan Malhotra", "M", 2014, "San Antonio Racquet Club"),
    ("Paloma Guerrero", "F", 2015, "San Antonio Racquet Club"),
    ("Bennett Ashgrove", "M", 2013, "San Antonio Racquet Club"),
    ("Suhani Wadhwa", "F", 2012, "San Antonio Racquet Club"),
    ("Cassius Renwick", "M", 2011, "San Antonio Racquet Club"),
    ("Mahdi Rostami", "M", 2010, "San Antonio Racquet Club"),
    ("Liliana Escobar", "F", 2011, "San Antonio Racquet Club"),
    ("Dashawn Beaumont", "M", 2009, "San Antonio Racquet Club"),
    ("Nolan Fitzpatrick", "M", 2008, "San Antonio Racquet Club"),
    ("Aroha Ngatai", "F", 2008, "San Antonio Racquet Club"),
    ("Mauricio Del Valle", "M", 2000, "San Antonio Racquet Club"),
    ("Shaurya Bakshi", "M", 2004, "San Antonio Racquet Club"),
    ("Weston Callaghan", "M", 2007, "San Antonio Racquet Club"),
    ("Camille Fortier", "F", 2000, "San Antonio Racquet Club"),
    ("Nandini Balachandran", "F", 2003, "San Antonio Racquet Club"),
    ("Zoya Karimova", "F", 2006, "San Antonio Racquet Club"),
    ("Ignacio Mendieta", "M", 1984, "San Antonio Racquet Club"),
    ("Wilhelmina Groot", "F", 1991, "San Antonio Racquet Club"),
    ("Cyrus Vanderhoof", "M", 1975, "San Antonio Racquet Club"),
    ("Adelina Popescu", "F", 1972, "San Antonio Racquet Club"),
    # ================= San Diego Badminton Club (22) ======================
    ("Rylan Kessler", "M", 2016, "San Diego Badminton Club"),
    ("Nyla Washington", "F", 2018, "San Diego Badminton Club"),
    ("Aksel Bergstrom", "M", 2015, "San Diego Badminton Club"),
    ("Tamsin Ferreira", "F", 2014, "San Diego Badminton Club"),
    ("Dhruv Rajagopalan", "M", 2012, "San Diego Badminton Club"),
    ("Odalys Serrato", "F", 2013, "San Diego Badminton Club"),
    ("Finnegan Marsh", "M", 2010, "San Diego Badminton Club"),
    ("Yannick Dupont", "M", 2011, "San Diego Badminton Club"),
    ("Sanaa Belhaj", "F", 2010, "San Diego Badminton Club"),
    ("Jericho Sandoval", "M", 2009, "San Diego Badminton Club"),
    ("Tanay Gopalakrishnan", "M", 2008, "San Diego Badminton Club"),
    ("Ottilie Vasquez", "F", 2009, "San Diego Badminton Club"),
    ("Alonso Ferrer", "M", 1998, "San Diego Badminton Club"),
    ("Hugo Marchetti-Silva", "M", 2001, "San Diego Badminton Club"),
    ("Nolan Ashworth", "M", 2005, "San Diego Badminton Club"),
    ("Wanjiku Njoroge", "F", 1996, "San Diego Badminton Club"),
    ("Ekaterina Volkova", "F", 2000, "San Diego Badminton Club"),
    ("Zenobia Farrukh", "F", 2004, "San Diego Badminton Club"),
    ("Nicolas Berthelot", "M", 1985, "San Diego Badminton Club"),
    ("Yasmin Aboud", "F", 1988, "San Diego Badminton Club"),
    ("Malcolm Ainsworth", "M", 1968, "San Diego Badminton Club"),
    ("Renate Schiller", "F", 1975, "San Diego Badminton Club"),
    # ================= Balboa Badminton Club (22) =========================
    ("Aurelio Pastrana", "M", 2017, "Balboa Badminton Club"),
    ("Tabitha Lindgren", "F", 2016, "Balboa Badminton Club"),
    ("Nakul Seshadri", "M", 2015, "Balboa Badminton Club"),
    ("Ophelia Ruiz", "F", 2014, "Balboa Badminton Club"),
    ("Kwabena Asante", "M", 2013, "Balboa Badminton Club"),
    ("Miriam Oskarsson", "F", 2012, "Balboa Badminton Club"),
    ("Sullivan Marchetti", "M", 2010, "Balboa Badminton Club"),
    ("Arman Tabatabai", "M", 2011, "Balboa Badminton Club"),
    ("Coral Benitez", "F", 2010, "Balboa Badminton Club"),
    ("Dmitri Yablonsky", "M", 2008, "Balboa Badminton Club"),
    ("Kenji Arakawa", "M", 2009, "Balboa Badminton Club"),
    ("Solene Girard", "F", 2008, "Balboa Badminton Club"),
    ("Rafael Ocampo-Diaz", "M", 1996, "Balboa Badminton Club"),
    ("Tarun Vishwanathan", "M", 2001, "Balboa Badminton Club"),
    ("Brody Kensington", "M", 2004, "Balboa Badminton Club"),
    ("Pilar Zambrano", "F", 1999, "Balboa Badminton Club"),
    ("Aiko Murakami", "F", 2003, "Balboa Badminton Club"),
    ("Fereshteh Nasseri", "F", 2007, "Balboa Badminton Club"),
    ("Kwesi Amankwah", "M", 1990, "Balboa Badminton Club"),
    ("Verity Cranshaw", "F", 1983, "Balboa Badminton Club"),
    ("Hamish Torrance", "M", 1976, "Balboa Badminton Club"),
    ("Georgette Lavoie", "F", 1970, "Balboa Badminton Club"),
    # ================= Orange County Badminton (22) =======================
    ("Tanner Vasilev", "M", 2018, "Orange County Badminton"),
    ("Rhiannon Beckwith", "F", 2017, "Orange County Badminton"),
    ("Vihaan Chidambaram", "M", 2014, "Orange County Badminton"),
    ("Marisol Cadena", "F", 2015, "Orange County Badminton"),
    ("Emrys Llewellyn", "M", 2012, "Orange County Badminton"),
    ("Chinelo Obiora", "F", 2013, "Orange County Badminton"),
    ("Diego Portilla", "M", 2011, "Orange County Badminton"),
    ("Hyun Woo Shin", "M", 2010, "Orange County Badminton"),
    ("Adele Fontaine", "F", 2011, "Orange County Badminton"),
    ("Barrett Lindqvist", "M", 2008, "Orange County Badminton"),
    ("Nasir Chowdhary", "M", 2009, "Orange County Badminton"),
    ("Katrina Bilodeau", "F", 2008, "Orange County Badminton"),
    ("Tristan Vahey", "M", 2000, "Orange County Badminton"),
    ("Yuvraj Sachdeva", "M", 2003, "Orange County Badminton"),
    ("Cormac Delahunt", "M", 2007, "Orange County Badminton"),
    ("Larissa Otieno", "F", 1997, "Orange County Badminton"),
    ("Bianca Zafiropoulos", "F", 2002, "Orange County Badminton"),
    ("Amirah Sutanto", "F", 2006, "Orange County Badminton"),
    ("Reginald Ashby-Kerr", "M", 1982, "Orange County Badminton"),
    ("Malika Dubois", "F", 1987, "Orange County Badminton"),
    ("Sergio Villagomez", "M", 1974, "Orange County Badminton"),
    ("Harriet Sundqvist", "F", 1969, "Orange County Badminton"),
    # ================= Michigan Badminton Club (22) =======================
    ("Auden Ferrick", "M", 2016, "Michigan Badminton Club"),
    ("Vaishnavi Karthikeyan", "F", 2018, "Michigan Badminton Club"),
    ("Kaspar Lindeman", "M", 2015, "Michigan Badminton Club"),
    ("Rosanna Petrucci", "F", 2014, "Michigan Badminton Club"),
    ("Tunde Balogun", "M", 2013, "Michigan Badminton Club"),
    ("Freida Osterberg", "F", 2012, "Michigan Badminton Club"),
    ("Lennox Fairbairn", "M", 2010, "Michigan Badminton Club"),
    ("Sarvesh Ayyangar", "M", 2011, "Michigan Badminton Club"),
    ("Bridget Kowalczyk", "F", 2010, "Michigan Badminton Club"),
    ("Maxwell Trent", "M", 2009, "Michigan Badminton Club"),
    ("Faisal Kadhim", "M", 2008, "Michigan Badminton Club"),
    ("Anwen Prydderch", "F", 2009, "Michigan Badminton Club"),
    ("Julian Weatherby", "M", 1997, "Michigan Badminton Club"),
    ("Anirudh Bhaskaran", "M", 2002, "Michigan Badminton Club"),
    ("Osmar Trevino", "M", 2006, "Michigan Badminton Club"),
    ("Halina Wojcik", "F", 1998, "Michigan Badminton Club"),
    ("Sadie Fournier", "F", 2001, "Michigan Badminton Club"),
    ("Naledi Sithole", "F", 2005, "Michigan Badminton Club"),
    ("Bernard Achterhof", "M", 1988, "Michigan Badminton Club"),
    ("Corinne Vachon", "F", 1984, "Michigan Badminton Club"),
    ("Silas Underhill", "M", 1972, "Michigan Badminton Club"),
    ("Margit Halvorsrud", "F", 1976, "Michigan Badminton Club"),
    # ================= Chicago Badminton Club (22) ========================
    ("Ronan Steffensen", "M", 2017, "Chicago Badminton Club"),
    ("Amira Zerhouni", "F", 2016, "Chicago Badminton Club"),
    ("Casper Wojtowicz", "M", 2014, "Chicago Badminton Club"),
    ("Leilani Bautista", "F", 2015, "Chicago Badminton Club"),
    ("Adnan Qureshi", "M", 2012, "Chicago Badminton Club"),
    ("Perpetua Nnaji", "F", 2013, "Chicago Badminton Club"),
    ("Grayson Ballard", "M", 2011, "Chicago Badminton Club"),
    ("Rithvik Nallamothu", "M", 2010, "Chicago Badminton Club"),
    ("Wilhelmina Croft", "F", 2011, "Chicago Badminton Club"),
    ("Jaromir Slavik", "M", 2008, "Chicago Badminton Club"),
    ("Oluwaseun Bamidele", "M", 2009, "Chicago Badminton Club"),
    ("Ines Salgado", "F", 2008, "Chicago Badminton Club"),
    ("Marcus Hollenbeck", "M", 1999, "Chicago Badminton Club"),
    ("Pradeep Muralidharan", "M", 2004, "Chicago Badminton Club"),
    ("Elijah Bronstein", "M", 2007, "Chicago Badminton Club"),
    ("Tallulah Winspear", "F", 1996, "Chicago Badminton Club"),
    ("Sadhana Vijayakumar", "F", 2001, "Chicago Badminton Club"),
    ("Marta Kozlowska", "F", 2005, "Chicago Badminton Club"),
    ("Osvaldo Ruvalcaba", "M", 1991, "Chicago Badminton Club"),
    ("Bronwyn Aitchison", "F", 1986, "Chicago Badminton Club"),
    ("Emmett Kirkbride", "M", 1971, "Chicago Badminton Club"),
    ("Dagmar Steinbach", "F", 1973, "Chicago Badminton Club"),
)

# A duplicate name is a silently merged person: ``slug_of`` is the
# participant id in every draw and the roster id in every meet, so two
# people sharing a name become one entrant. 516 rows are hand-written, so
# this is the check that makes that a loud import error rather than a
# confusing draw.
assert len({person[0] for person in PLAYERS}) == len(PLAYERS), (
    "duplicate name in PLAYERS: "
    + str(sorted({n for n in (p[0] for p in PLAYERS)
                  if [q[0] for q in PLAYERS].count(n) > 1}))
)


def eligible(
    *,
    gender: Optional[str] = None,
    min_year: Optional[int] = None,
    max_year: Optional[int] = None,
    club: Optional[str] = None,
) -> list[tuple[str, str, int, str]]:
    """The pool, filtered. ``min_year``/``max_year`` are inclusive bounds on
    the birth year, so U13 in 2026 is ``min_year=2014``. ``club`` narrows to
    one club's members — how a dual meet fields two squads."""
    return [
        person
        for person in PLAYERS
        if (gender is None or person[1] == gender)
        and (min_year is None or person[2] >= min_year)
        and (max_year is None or person[2] <= max_year)
        and (club is None or person[3] == club)
    ]


def slug_of(name: str) -> str:
    """A stable, readable participant id from a person's name.

    Readable ids matter here in a way they do not in the other scenarios:
    these strings are what an operator sees in a draw's URL and in the
    ``sourceEntryId`` provenance chain when they go looking for why a
    player is in a bracket.

    It is also the *identity* the bracket engine schedules on. A doubles
    participant carries ``members: [slug, slug]`` and the adapter expands
    teams to their member ids (``bracket/adapter.expand_side``),
    so a person entered in both singles and doubles is ONE engine player
    and cannot be put on two courts at once. That only holds because both
    events derive the id from the same name.
    """
    return "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")


# ---- meet construction ---------------------------------------------------
#
# ``make_meet_state`` in ``factories.py`` gives every rank its own dedicated
# pair of players, which is right for a 4-match smoke scenario and wrong for
# a league: it would need 106 juniors per club to field 73 matches, and each
# of them would play exactly once. Real league players play three or four
# times across singles, doubles and mixed, which is also what makes the
# solve worth watching — rest windows and double-booking become live
# constraints instead of vacuous ones.

#: rank kind -> the genders each side is drawn from. Singles take one
#: person per side, doubles two, mixed one of each.
_KIND_SIDES: dict[str, tuple[str, ...]] = {
    "MS": ("M",),
    "WS": ("F",),
    "MD": ("M", "M"),
    "WD": ("F", "F"),
    "XD": ("M", "F"),
}


def _next_person(queue: list, refill, taken: list):
    """Pop someone not already on this side, refilling+reshuffling the
    club queue when it runs out.

    A person already picked for this side goes back to the *front* of the
    queue so they come out first next time — a doubles pair is never the
    same human twice, and nobody is skipped as a side effect. Bounded
    rather than ``while True``: a band with fewer than two eligible members
    is a data error and should say so, not spin.
    """
    for _ in range(10):
        if not queue:
            queue.extend(refill())
        person = queue.pop()
        if person not in taken:
            return person
        queue.insert(0, person)
    raise RuntimeError(f"band too small to fill a side (taken={taken})")


def make_meet_blob(seed: int, spec: dict) -> tuple[dict, dict[str, float]]:
    """A ``TournamentStateDTO`` blob for a real dual meet, plus ratings.

    Players are drawn per (club, gender, age band) from a cycling queue, so
    a squad of 36 covers 106 player-slots at roughly three matches each and
    every rank instance is filled by someone actually eligible for its band.

    Rank *codes* stay purely alphabetic (``BS``, ``GD``, ``XD``) because the
    UI groups matches by ``eventRank.match(/^[A-Z]+/)`` — a code ending in
    digits (``BS11``) would group under ``BS`` and stop matching its own
    ``rankCounts`` key. The age band therefore rides in the rank *number*
    ranges (BS1-BS7 = U11, BS8-BS14 = U13, …), which is how a league
    programme prints it anyway.
    """
    meet = spec["meet"]
    rng = derive_rng(seed, "demo-meet", spec["key"])
    rating_rng = derive_rng(seed, "demo-meet-rating", spec["key"])
    clubs = meet["groups"]
    groups = [{"id": f"g{i + 1}", "name": club} for i, club in enumerate(clubs)]

    queues: dict[tuple, list] = {}
    players: dict[str, dict] = {}
    ratings: dict[str, float] = {}
    matches: list[dict] = []
    rank_counts: dict[str, int] = {}

    def pick(club: str, gender: str, lo: int, tag: str, hi: int, taken: list) -> str:
        key = (club, gender, lo, hi)

        def refill():
            found = eligible(gender=gender, club=club, min_year=lo, max_year=hi)
            rng.shuffle(found)
            return found

        person = _next_person(queues.setdefault(key, []), refill, taken)
        taken.append(person)
        name, _g, _y, person_club = person
        pid = slug_of(name)
        row = players.get(pid)
        if row is None:
            row = {
                "id": pid,
                "name": name,
                "groupId": "g1" if club == clubs[0] else "g2",
                "ranks": [],
                "availability": [],
                "notes": person_club,
            }
            players[pid] = row
            ratings[pid] = 1200.0 + rating_rng.uniform(-250.0, 250.0)
        if tag not in row["ranks"]:
            row["ranks"].append(tag)
        return pid

    for rank in meet["ranks"]:
        code, sides = rank["code"], _KIND_SIDES[rank["kind"]]
        number = 0
        for count, lo, hi in rank["bands"]:
            for _ in range(count):
                number += 1
                tag = f"{code}{number}"
                taken: list = []
                side_a = [pick(clubs[0], g, lo, tag, hi, taken) for g in sides]
                side_b = [pick(clubs[1], g, lo, tag, hi, taken) for g in sides]
                matches.append(
                    {
                        "id": f"m{len(matches) + 1:03d}",
                        "matchNumber": len(matches) + 1,
                        "sideA": side_a,
                        "sideB": side_b,
                        "eventRank": tag,
                        "durationSlots": 1,
                        "matchType": "dual",
                    }
                )
        rank_counts[code] = number

    config = {
        "tournamentName": spec["name"],
        "meetMode": "dual",
        "intervalMinutes": 30,
        "dayStart": meet.get("dayStart", "08:00"),
        "dayEnd": meet.get("dayEnd", "20:00"),
        "tournamentDate": spec["date"],
        "breaks": meet.get("breaks", []),
        "courtCount": meet["courts"],
        "defaultRestMinutes": 30,
        "freezeHorizonSlots": 0,
        "rankCounts": rank_counts,
        "deterministic": True,
        "randomSeed": seed,
        "solverTimeLimitSeconds": meet.get("solverSeconds", 20.0),
        "scoringFormat": "simple",
    }
    blob = {
        "version": 1,
        "config": config,
        "groups": groups,
        "players": list(players.values()),
        "matches": matches,
        "schedule": None,
        "planFinalized": False,
    }
    return blob, ratings


# ---- workspace specs -----------------------------------------------------
#
# ``kind``     — 'meet' or 'bracket'; decides which engine the workspace runs.
# ``modules``  — the enable set, deliberately varied so the Hub shows the
#                control-plane model rather than eight identical rows.
# ``events``   — bracket draws (id/label/format/eligibility/size) or, for a
#                meet, the ``ranks`` programme.
# ``entries``  — public entry page config, or None for no Entries module.
# ``play``     — 'full' | 'partial' | 'spread' | 'none'; how far the floor
#                gets driven, so the demo has finished events, live ones and
#                untouched ones instead of one uniform state.
#
# **Dates are chosen to agree with the floor state, and every one of them
# stays inside 2026 so the owner's tournament names remain literally true.**
# The wall clock decides whether an entry page accepts anything at all
# (``_event_is_open`` measures ``closes_at`` against *now*), so an entry
# window has to be live — and a live entry window on a tournament that
# finished in February is a contradiction on screen. Played-out events
# therefore sit in the recent past, the mid-session one is today, and the
# three that have not started sit in the near future with their deadlines in
# front of them. The names, organisations and cities are the owner's.
#
# An event spec's ``pair`` key ('MD'/'WD'/'XD') makes its participants
# doubles TEAMS: ``size`` counts pairs, and each carries ``members`` so the
# engine schedules the humans, not the pairing.

WORKSPACES: tuple[dict, ...] = (
    {
        "key": "fk-junior-league",
        "name": "F&K Junior League Winter 2026",
        "org": "F & K Tournaments",
        "city": "Fremont, U.S.A.",
        # Verbatim: a winter league, played out, in the past. Nothing about
        # it is time-sensitive, so nothing about it had to move.
        "date": "2026-01-24",
        "dates": "2026-01-24 to 2026-03-07",
        "kind": "meet",
        "modules": {"meet": "enabled", "display": "enabled"},
        # A league IS a dual meet — two clubs, matched ranks — which is
        # exactly the shape Meet models. Three age bands x five disciplines
        # = 73 matches over two 36-strong academy squads, each junior
        # playing three or four times.
        "meet": {
            "groups": ("Fremont Badminton Academy", "Milpitas Youth BC"),
            "courts": 8,
            "dayStart": "08:00",
            "dayEnd": "20:00",
            "solverSeconds": 20.0,
            "ranks": (
                {"code": "BS", "kind": "MS",
                 "bands": ((7, 2016, 2018), (7, 2014, 2015), (6, 2012, 2013))},
                {"code": "GS", "kind": "WS",
                 "bands": ((7, 2016, 2018), (7, 2014, 2015), (6, 2012, 2013))},
                {"code": "BD", "kind": "MD",
                 "bands": ((4, 2016, 2018), (4, 2014, 2015), (3, 2012, 2013))},
                {"code": "GD", "kind": "WD",
                 "bands": ((4, 2016, 2018), (4, 2014, 2015), (3, 2012, 2013))},
                {"code": "XD", "kind": "XD",
                 "bands": ((4, 2016, 2018), (4, 2014, 2015), (3, 2012, 2013))},
            ),
        },
        "play": "full",
    },
    {
        "key": "husky-open",
        "name": "2026 Husky Open",
        "org": "The Bellevue Badminton Club",
        "city": "Seattle",
        # MOVED to this weekend: this is the workspace caught mid-event, and
        # a half-played draw dated six months ago reads as an abandoned one.
        "date": "2026-08-09",
        "dates": "2026-08-09 to 2026-08-10",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "display": "enabled"},
        "courts": 8,
        "events": (
            {"id": "ms-a", "label": "Men's Singles A", "code": "MSA",
             "format": "se", "size": 32, "gender": "M",
             "min_year": 1996, "max_year": 2007},
            {"id": "ws-a", "label": "Women's Singles A", "code": "WSA",
             "format": "se", "size": 16, "gender": "F",
             "min_year": 1996, "max_year": 2007},
            {"id": "md-open", "label": "Men's Doubles Open", "code": "MDO",
             "format": "de", "size": 16, "pair": "MD",
             "min_year": 1996, "max_year": 2007},
            {"id": "xd-open", "label": "Mixed Doubles Open", "code": "XDO",
             "format": "rr", "size": 8, "pair": "XD",
             "min_year": 1996, "max_year": 2007},
        ),
        "play": "partial",
    },
    {
        "key": "polar-bear",
        "name": "2026 Polar Bear LXXI",
        "org": "California Badminton",
        "city": "Union City",
        # Verbatim: played to completion, in the past, standings final.
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-15",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "display": "enabled"},
        "courts": 10,
        # Four level flights in four different formats — half of
        # FORMAT_REGISTRY on one screen, all of it played out.
        "events": (
            {"id": "open-a", "label": "Open A", "code": "OA",
             "format": "se", "size": 32, "min_year": 1996, "max_year": 2007},
            {"id": "open-b", "label": "Open B", "code": "OB",
             "format": "de", "size": 16, "min_year": 1986, "max_year": 2007},
            {"id": "open-c", "label": "Open C", "code": "OC",
             "format": "rr", "size": 6, "min_year": 1982, "max_year": 2007},
            {"id": "open-d", "label": "Open D", "code": "OD",
             "format": "swiss", "size": 16, "min_year": 1982, "max_year": 2009,
             "config": {"swiss_rounds": 4}},
        ),
        "play": "full",
    },
    {
        "key": "ut-austin-lny",
        "name": "UT Austin Lunar New Year Tournament",
        "org": "Michigan Badminton Club",
        "city": "Austin",
        # Verbatim: Lunar New Year is February by definition, so this one
        # could not move; it is played to completion instead, which is what
        # makes a February date honest.
        "date": "2026-02-14",
        "dates": "2026-02-14 to 2026-02-15",
        "kind": "bracket",
        # Deliberately the thinnest module set in the demo: Bracket alone,
        # no Display. The Hub should not look like every workspace is the
        # same workspace.
        "modules": {"bracket": "enabled"},
        "courts": 8,
        # The two placement formats, both played until EVERY position is
        # decided — the thing compass and Monrad exist for and the thing a
        # single-elimination board cannot show.
        "events": (
            {"id": "open-compass", "label": "Open (Compass)", "code": "OC",
             "format": "compass", "size": 16, "min_year": 1996, "max_year": 2007},
            {"id": "open-monrad", "label": "Open (Monrad)", "code": "OM",
             "format": "monrad", "size": 16, "min_year": 1996, "max_year": 2007,
             "config": {"consolation": "full"}},
            {"id": "ms-open", "label": "Men's Singles", "code": "MS",
             "format": "se", "size": 32, "gender": "M",
             "min_year": 1996, "max_year": 2007},
            {"id": "ws-open", "label": "Women's Singles", "code": "WS",
             "format": "se", "size": 16, "gender": "F",
             "min_year": 1996, "max_year": 2007},
        ),
        "play": "full",
    },
    {
        "key": "dfw-lewisville",
        "name": (
            "2026 YONEX DFW Badminton Lewisville South Open "
            "Regional Championships"
        ),
        "org": "USA Badminton",
        "city": "Lewisville",
        # MOVED forward: this workspace's entry page is OPEN, and an open
        # entry window has to sit in front of the tournament it feeds.
        "date": "2026-09-11",
        "dates": "2026-09-11 to 2026-09-13",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "entries": "enabled", "display": "enabled"},
        "courts": 10,
        # The Entries flagship: nine age-and-gender draws filled by the
        # public entry pipeline (signup -> submit -> confirm -> commit) and
        # only then generated.
        #
        # ``size`` is the DIRECT seeding and is never 0, because **a draw
        # cannot be created empty** — ``POST /bracket`` refuses "event
        # 'u11-bs' needs at least 2 participants", while the commit seam
        # needs the draw to already exist to map an entry onto it. Two
        # direct entries per event (four for the double-elimination one,
        # whose per-format floor is 4) is the smallest honest way through
        # that pair of rules; everyone else in these draws arrives through
        # the public form.
        #
        # ``bracket_size`` is declared and not derived, for the third rule
        # in this stack: the draw's size is fixed when the draw is CREATED,
        # so a size derived from two direct entries refuses to generate the
        # moment the entries land. ``entry_slots`` is the rest of that
        # arithmetic — bracket_size minus the direct seeds — so the field
        # arrives exactly full with no byes.
        "events": (
            {"id": "u11-bs", "label": "U11 Boys' Singles", "code": "U11BS",
             "format": "se", "size": 2, "bracket_size": 8, "entry_slots": 6,
             "gender": "M", "min_year": 2016, "max_year": 2018},
            {"id": "u11-gs", "label": "U11 Girls' Singles", "code": "U11GS",
             "format": "se", "size": 2, "bracket_size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2016, "max_year": 2018},
            {"id": "u13-bs", "label": "U13 Boys' Singles", "code": "U13BS",
             "format": "se", "size": 2, "bracket_size": 16, "entry_slots": 14,
             "gender": "M", "min_year": 2014, "max_year": 2015},
            {"id": "u13-gs", "label": "U13 Girls' Singles", "code": "U13GS",
             "format": "se", "size": 2, "bracket_size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2014, "max_year": 2015},
            {"id": "u15-bs", "label": "U15 Boys' Singles", "code": "U15BS",
             "format": "se", "size": 2, "bracket_size": 16, "entry_slots": 14,
             "gender": "M", "min_year": 2012, "max_year": 2013},
            {"id": "u15-gs", "label": "U15 Girls' Singles", "code": "U15GS",
             "format": "se", "size": 2, "bracket_size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2012, "max_year": 2013},
            # Four direct, not two: double elimination refuses a bracket
            # size below 4, a per-FORMAT floor on top of the per-event one.
            {"id": "u17-bs", "label": "U17 Boys' Singles", "code": "U17BS",
             "format": "de", "size": 4, "bracket_size": 16, "entry_slots": 12,
             "gender": "M", "min_year": 2010, "max_year": 2011},
            {"id": "u17-gs", "label": "U17 Girls' Singles", "code": "U17GS",
             "format": "se", "size": 2, "bracket_size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2010, "max_year": 2011},
            {"id": "u19-bs", "label": "U19 Boys' Singles", "code": "U19BS",
             "format": "se", "size": 2, "bracket_size": 16, "entry_slots": 14,
             "gender": "M", "min_year": 2008, "max_year": 2009},
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
                "2. Entries close {closes}. Withdrawals are accepted for "
                "three days after that.\n"
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
            # Days from the moment the seeder RUNS. The tournament date
            # above was chosen so this lands in front of it.
            "closesInDays": 21,
            "withdrawsInDays": 24,
            # Two of every draw's newcomers also enter the next band up —
            # juniors "play up" constantly, and it is the reason
            # ``maxEventsPerPerson`` exists to be tested against.
            "playUp": 2,
            # Entries land pending; the demo confirms and commits them.
            "workflow": "commit",
        },
        "play": "none",
    },
    {
        "key": "nashville-doubles",
        "name": "Nashville Doubles Classic 2026 (Internal)",
        "org": "Nashville Badminton Association",
        "city": "Hermitage",
        # MOVED to today: this is the Operations flagship, and "a floor
        # mid-session" is a claim about right now.
        "date": "2026-08-10",
        "dates": "2026-08-10 to 2026-08-11",
        "kind": "meet",
        # A hybrid workspace: both engines enabled at once, which is the
        # case the module contract exists to keep honest. Doubles
        # throughout, because the tournament is a doubles classic.
        "meet": {
            "groups": ("Nashville Badminton Association", "Music City Shuttlers"),
            "courts": 6,
            "dayStart": "09:00",
            "dayEnd": "18:00",
            "solverSeconds": 15.0,
            "ranks": (
                {"code": "MD", "kind": "MD", "bands": ((8, 1986, 1995),)},
                {"code": "WD", "kind": "WD", "bands": ((8, 1986, 1995),)},
                {"code": "XD", "kind": "XD", "bands": ((8, 1986, 1995),)},
            ),
        },
        "modules": {"meet": "enabled", "bracket": "enabled", "display": "enabled"},
        "courts": 6,
        # 1996-2007 — deliberately disjoint from the meet squads' 1986-1995
        # band, so no human is scheduled by both engines at once.
        "events": (
            {"id": "md-classic", "label": "Men's Doubles Classic", "code": "MDC",
             "format": "se", "size": 16, "pair": "MD",
             "min_year": 1996, "max_year": 2007},
            {"id": "wd-classic", "label": "Women's Doubles Classic", "code": "WDC",
             "format": "se", "size": 16, "pair": "WD",
             "min_year": 1996, "max_year": 2007},
            {"id": "xd-classic", "label": "Mixed Doubles Classic", "code": "XDC",
             "format": "de", "size": 16, "pair": "XD",
             "min_year": 1996, "max_year": 2007},
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
        # MOVED forward: its entry page is open and its desk has a live
        # review queue, so the event is ahead of us.
        "date": "2026-09-25",
        "dates": "2026-09-25 to 2026-09-27",
        "kind": "bracket",
        "modules": {"bracket": "enabled", "entries": "enabled", "display": "enabled"},
        "courts": 8,
        # These draws are seeded DIRECTLY and generated at creation — the
        # entry queue below is deliberately left uncommitted, so the desk
        # has something on it. Sizes are exact powers of two, so no draw
        # opens with a bye.
        "events": (
            {"id": "u11-bs", "label": "U11 Boys' Singles", "code": "U11BS",
             "format": "se", "size": 8, "entry_slots": 6,
             "gender": "M", "min_year": 2016, "max_year": 2018},
            {"id": "u11-gs", "label": "U11 Girls' Singles", "code": "U11GS",
             "format": "se", "size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2016, "max_year": 2018},
            {"id": "u13-bs", "label": "U13 Boys' Singles", "code": "U13BS",
             "format": "se", "size": 16, "entry_slots": 6,
             "gender": "M", "min_year": 2014, "max_year": 2015},
            {"id": "u13-gs", "label": "U13 Girls' Singles", "code": "U13GS",
             "format": "se", "size": 16, "entry_slots": 6,
             "gender": "F", "min_year": 2014, "max_year": 2015},
            {"id": "u15-bs", "label": "U15 Boys' Singles", "code": "U15BS",
             "format": "se", "size": 16, "entry_slots": 6,
             "gender": "M", "min_year": 2012, "max_year": 2013},
            {"id": "u15-gs", "label": "U15 Girls' Singles", "code": "U15GS",
             "format": "se", "size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2012, "max_year": 2013},
            {"id": "u17-bs", "label": "U17 Boys' Singles", "code": "U17BS",
             "format": "se", "size": 16, "entry_slots": 6,
             "gender": "M", "min_year": 2010, "max_year": 2011},
            {"id": "u19-bs", "label": "U19 Boys' Singles", "code": "U19BS",
             "format": "se", "size": 8, "entry_slots": 6,
             "gender": "M", "min_year": 2008, "max_year": 2009},
            {"id": "u19-gs", "label": "U19 Girls' Singles", "code": "U19GS",
             "format": "se", "size": 8, "entry_slots": 6,
             "gender": "F", "min_year": 2008, "max_year": 2009},
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
                "2. Entries close {closes}.\n"
                "3. Draws are published 48 hours before play."
            ),
            "waiverRequired": True,
            "feeSchedule": {"1": 3500, "2": 5500},
            "paymentInstructions": "Cash or card at the desk on arrival.",
            "maxEventsPerPerson": 2,
            "collectPhone": False,
            "closesInDays": 14,
            "withdrawsInDays": 17,
            "playUp": 2,
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
        "date": "2026-10-16",
        "dates": "2026-10-16 to 2026-10-18",
        "invented": True,
        "kind": "bracket",
        # No Display: the fourth distinct module set in the demo.
        "modules": {"bracket": "enabled", "entries": "enabled"},
        "courts": 8,
        "events": (
            {"id": "open-a", "label": "Open A", "code": "OA",
             "format": "se", "size": 32, "min_year": 1996, "max_year": 2007},
            {"id": "open-b", "label": "Open B", "code": "OB",
             "format": "de", "size": 16, "min_year": 1986, "max_year": 2007},
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
            "introText": (
                "Entries for the 68th Dave Freeman Classic open six weeks "
                "before the first day of play."
            ),
            "regulationsText": "Regulations will be published with the entry form.",
            "waiverRequired": False,
            "feeSchedule": {"1": 5000, "2": 8000},
            "paymentInstructions": "Details to follow.",
            "maxEventsPerPerson": 2,
            "collectPhone": False,
            "closesInDays": None,
            "withdrawsInDays": None,
            "playUp": 0,
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
# they register (``identity/auth.ensure_personal_org``). So the way to seed
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
# EIGHT accounts, not eighty: ``entrant_signup_max_per_ip`` is 8 per hour from
# one address and this seeder is one address. That is not a limitation being
# tolerated, it is the shape of the surface — real entries arrive from many
# addresses, and the budget is sized for the family or club secretary who
# creates several accounts from one venue. So the seeder submits the way those
# people do: eight accounts, each carrying a squad of up to twelve players on
# one form (``entries/entry_form.parse_players`` exists for exactly that),
# which keeps the whole demo inside ``entries_max_per_ip`` as well.

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
    {"email": "desk@lewisville-bc.example.test", "displayName": "Lewisville Badminton Club",
     "phone": "+1 555 0455", "role": "club secretary"},
    {"email": "coach.ferrick@example.test", "displayName": "Coach Auden Ferrick Sr",
     "phone": "+1 555 0519", "role": "club secretary"},
)


def chunk(items: Sequence, size: int) -> list[list]:
    """``items`` split into runs of at most ``size``.

    One submission carries 1-N players (a club secretary enters a squad),
    which is both the realistic shape and the only way ~130 entrants fit
    inside ``entries_max_per_ip`` — 20 submissions per 10 minutes from one
    address. Going around that budget was never on the table; the budget is
    sized for exactly this use.
    """
    return [list(items[i:i + size]) for i in range(0, len(items), size)]
