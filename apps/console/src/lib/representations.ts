/**
 * The controlled `representation` vocabulary — the console mirror of
 * `apps/api/src/core/representation.py` (D4 / O4).
 *
 * "Representing" is the association a player COMPETES for at this event: not
 * citizenship, not residency, not the club. Absent/empty IS Unknown — there is
 * no companion flag, and the console must not invent a code for it.
 *
 * This list is a COPY, not a second source of truth: the backend validates
 * every write against its own dict and answers 422 for an unlisted code. When
 * a code is added there, add the same row here.
 */

/** What the console renders when the code is absent. */
export const UNKNOWN_REPRESENTATION_LABEL = 'Unknown';

/** code -> display name. BWF member associations. */
export const REPRESENTATIONS: Readonly<Record<string, string>> = {
  ALG: 'Algeria',
  ARG: 'Argentina',
  ARM: 'Armenia',
  AUS: 'Australia',
  AUT: 'Austria',
  AZE: 'Azerbaijan',
  BAN: 'Bangladesh',
  BAR: 'Barbados',
  BEL: 'Belgium',
  BLR: 'Belarus',
  BRA: 'Brazil',
  BUL: 'Bulgaria',
  CAN: 'Canada',
  CHI: 'Chile',
  CHN: 'China',
  COL: 'Colombia',
  CRO: 'Croatia',
  CUB: 'Cuba',
  CYP: 'Cyprus',
  CZE: 'Czechia',
  DEN: 'Denmark',
  DOM: 'Dominican Republic',
  ECU: 'Ecuador',
  EGY: 'Egypt',
  ENG: 'England',
  ESP: 'Spain',
  EST: 'Estonia',
  FIN: 'Finland',
  FRA: 'France',
  GER: 'Germany',
  GRE: 'Greece',
  GUA: 'Guatemala',
  HKG: 'Hong Kong China',
  HUN: 'Hungary',
  INA: 'Indonesia',
  IND: 'India',
  IRI: 'Iran',
  IRL: 'Ireland',
  ISL: 'Iceland',
  ISR: 'Israel',
  ITA: 'Italy',
  JAM: 'Jamaica',
  JOR: 'Jordan',
  JPN: 'Japan',
  KAZ: 'Kazakhstan',
  KEN: 'Kenya',
  KOR: 'Korea',
  KSA: 'Saudi Arabia',
  KUW: 'Kuwait',
  LAT: 'Latvia',
  LTU: 'Lithuania',
  LUX: 'Luxembourg',
  MAC: 'Macau China',
  MAS: 'Malaysia',
  MAW: 'Malawi',
  MDV: 'Maldives',
  MEX: 'Mexico',
  MGL: 'Mongolia',
  MKD: 'North Macedonia',
  MLT: 'Malta',
  MRI: 'Mauritius',
  MYA: 'Myanmar',
  NCL: 'New Caledonia',
  NED: 'Netherlands',
  NEP: 'Nepal',
  NGR: 'Nigeria',
  NIR: 'Northern Ireland',
  NOR: 'Norway',
  NZL: 'New Zealand',
  PAK: 'Pakistan',
  PER: 'Peru',
  PHI: 'Philippines',
  POL: 'Poland',
  POR: 'Portugal',
  PUR: 'Puerto Rico',
  QAT: 'Qatar',
  ROU: 'Romania',
  RSA: 'South Africa',
  RUS: 'Russia',
  SGP: 'Singapore',
  SCO: 'Scotland',
  SLO: 'Slovenia',
  SRI: 'Sri Lanka',
  SUI: 'Switzerland',
  SVK: 'Slovakia',
  SWE: 'Sweden',
  THA: 'Thailand',
  TPE: 'Chinese Taipei',
  TTO: 'Trinidad and Tobago',
  TUR: 'Turkiye',
  UAE: 'United Arab Emirates',
  UGA: 'Uganda',
  UKR: 'Ukraine',
  USA: 'United States',
  UZB: 'Uzbekistan',
  VIE: 'Vietnam',
  WAL: 'Wales',
  ZAM: 'Zambia',
};

/** Display name for a code, or the Unknown label when absent/unlisted. */
export function representationName(code: string | null | undefined): string {
  if (typeof code === 'string' && code in REPRESENTATIONS) {
    return REPRESENTATIONS[code];
  }
  return UNKNOWN_REPRESENTATION_LABEL;
}

/** Short display for a roster row: `USA` when known, `Unknown` when not. */
export function representationCodeLabel(code: string | null | undefined): string {
  return typeof code === 'string' && code in REPRESENTATIONS
    ? code
    : UNKNOWN_REPRESENTATION_LABEL;
}

/**
 * Options for the "Representing" select, by display name.
 *
 * Unknown is deliberately NOT in this list: it is the ABSENCE of a code, and
 * the design system's `Select` already models that as `clearable` with the
 * placeholder as its label (Radix forbids an item whose value is `''`). Render
 * the field as `clearable` with `placeholder={UNKNOWN_REPRESENTATION_LABEL}`
 * so Unknown is a real, selectable choice and the honest default.
 */
export const REPRESENTATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  Object.entries(REPRESENTATIONS)
    .map(([value, name]) => ({ value, label: `${name} (${value})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
