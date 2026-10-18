import type { TMDBCrew, TMDBMovieDetails, TMDBTVDetails, TMDBCast } from '../types/tmdb';

export interface DisplayCrewMember {
  id: number;
  name: string;
  department: string;
  job: string;
  profile_path?: string | null;
}

function prioritizeCrew(dept: string, crewList: TMDBCrew[]): TMDBCrew[] {
  if (dept === 'Directing') {
    return [...crewList].sort((a, b) => {
      const aScore = a.job === 'Director' ? 0 : (a.job?.toLowerCase().includes('director') ? 1 : 2);
      const bScore = b.job === 'Director' ? 0 : (b.job?.toLowerCase().includes('director') ? 1 : 2);
      return aScore - bScore;
    });
  }
  if (dept === 'Writing') {
    const isMainWriter = (job?: string) => {
      if (!job) return 2;
      const j = job.toLowerCase();
      if (['screenplay', 'writer', 'story', 'teleplay', 'creator'].includes(j)) return 0;
      if (j.includes('writer') || j.includes('screenplay')) return 1;
      return 2;
    };
    return [...crewList].sort((a, b) => isMainWriter(a.job) - isMainWriter(b.job));
  }
  if (dept === 'Production') {
    const isMainProducer = (job?: string) => {
      if (!job) return 2;
      const j = job.toLowerCase();
      if (['producer', 'executive producer'].includes(j)) return 0;
      if (j.includes('producer')) return 1;
      return 2;
    };
    return [...crewList].sort((a, b) => isMainProducer(a.job) - isMainProducer(b.job));
  }
  return crewList;
}

export function extractCrewMembers(
  details: (TMDBMovieDetails | TMDBTVDetails) | null,
  mediaType: 'movie' | 'tv',
  selectedSeasonData?: { season?: number; cast?: TMDBCast[]; crew?: TMDBCrew[] } | null
): DisplayCrewMember[] {
  if (!details) return [];

  const seasonCrew = (mediaType === 'tv' && selectedSeasonData?.crew && selectedSeasonData.crew.length > 0)
    ? selectedSeasonData.crew
    : [];
  const detailsCrew = details.credits?.crew || [];

  const extractDept = (
    dept: string,
    initialItems: DisplayCrewMember[] = []
  ): DisplayCrewMember[] => {
    const list: DisplayCrewMember[] = [];
    const seen = new Set<number>();

    for (const item of initialItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
        if (list.length >= 3) return list;
      }
    }

    const primaryCrew = seasonCrew.length > 0 ? seasonCrew : detailsCrew;
    const sortedPrimary = prioritizeCrew(dept, primaryCrew);

    for (const c of sortedPrimary) {
      if (c && c.id && c.department === dept && !seen.has(c.id)) {
        seen.add(c.id);
        list.push({
          id: c.id,
          name: c.name,
          department: c.department,
          job: c.job || dept,
          profile_path: c.profile_path || null
        });
        if (list.length >= 3) return list;
      }
    }

    // If seasonCrew was used but had fewer than 3 for this department, supplement from detailsCrew
    if (list.length < 3 && seasonCrew.length > 0) {
      const sortedDetails = prioritizeCrew(dept, detailsCrew);
      for (const c of sortedDetails) {
        if (c && c.id && c.department === dept && !seen.has(c.id)) {
          seen.add(c.id);
          list.push({
            id: c.id,
            name: c.name,
            department: c.department,
            job: c.job || dept,
            profile_path: c.profile_path || null
          });
          if (list.length >= 3) return list;
        }
      }
    }

    return list;
  };

  // 1. Directing (max 3)
  const directing = extractDept('Directing');

  // 2. Writing (max 3, include created_by for TV shows)
  const initialWriting: DisplayCrewMember[] = [];
  if (mediaType === 'tv' && 'created_by' in details && Array.isArray(details.created_by)) {
    for (const creator of details.created_by) {
      if (creator && creator.id) {
        initialWriting.push({
          id: creator.id,
          name: creator.name,
          department: 'Writing',
          job: 'Creator',
          profile_path: creator.profile_path || null
        });
      }
    }
  }
  const writing = extractDept('Writing', initialWriting);

  // 3. Production (max 3)
  const production = extractDept('Production');

  return [...directing, ...writing, ...production];
}

export function getCrewRoleColor(department: string): string {
  switch (department) {
    case 'Directing':
      return 'text-hbo-cyan';
    case 'Writing':
      return 'text-amber-400';
    case 'Production':
      return 'text-hbo-purple-light';
    default:
      return 'text-hbo-cyan';
  }
}
