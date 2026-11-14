type ContributionLevel = 0 | 1 | 2 | 3 | 4;

interface ContributionData {
  levels: Array<Array<ContributionLevel | null>>;
}

function parseContributionData(value: unknown): ContributionData {
  if (!isRecord(value) || !Array.isArray(value.levels) || value.levels.length === 0) {
    throw new Error('Contribution data must contain a non-empty levels array.');
  }
  const levels = value.levels.map((week: unknown) => {
    if (!Array.isArray(week) || week.length === 0 || week.length > 7) {
      throw new Error('Each contribution week must contain 1 to 7 days.');
    }
    return week.map((level: unknown): ContributionLevel | null => {
      if (level === null || level === 0 || level === 1 || level === 2 || level === 3 || level === 4) {
        return level;
      }
      throw new Error('Contribution levels must be 0 to 4, or null for dates outside the displayed period.');
    });
  });
  return { levels };
}
