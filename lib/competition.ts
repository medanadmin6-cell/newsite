const SITE = /^(betvanta|stakeza|velora|betlixx|3btafric)$/i;

/** The competition line on a card. A custom match has no country, and the site name is not part of the league. */
export function competitionLabel(country: string, league: string): string {
  const title = league.replace(/^(?:betvanta|stakeza|velora|betlixx|3btafric)\s+/i, "").trim() || league;
  const place = country.trim();
  if (!place || SITE.test(place)) return title;
  return `${place} - ${title}`;
}
