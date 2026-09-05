/** The markets a project or prompt can target.
 *
 * Mirrors backend/countries.py — the backend validates every write against
 * its own copy, so a code missing here is merely unpickable in the UI, while
 * a code missing there is rejected. Keep the two in sync when adding a market.
 *
 * Names are the plain display form ("United Kingdom"); the backend keeps the
 * article-prefixed form ("the United Kingdom") because it reads them into a
 * sentence, and that difference is deliberate.
 */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? code;
}
