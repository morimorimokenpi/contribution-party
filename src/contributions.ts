type ContributionLevel = 0 | 1 | 2 | 3 | 4;

interface ContributionData {
  levels: Array<Array<ContributionLevel | null>>;
}

function parseContributionData(value: unknown): ContributionData {
  if (!isRecord(value) || !Array.isArray(value.levels) || value.levels.length === 0) {
    throw new Error('草データのlevelsが見つかりません。');
  }
  const levels = value.levels.map((week: unknown) => {
    if (!Array.isArray(week) || week.length === 0 || week.length > 7) {
      throw new Error('1週の草データは1〜7日分にしてください。');
    }
    return week.map((level: unknown): ContributionLevel | null => {
      if (level === null || level === 0 || level === 1 || level === 2 || level === 3 || level === 4) {
        return level;
      }
      throw new Error('草の濃淡は0〜4、期間外はnullで指定してください。');
    });
  });
  return { levels };
}
