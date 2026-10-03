/**
 * Discipline streak. Pure: given per-active-day discipline flags, compute the current and best
 * streaks. A "streak" runs over consecutive ACTIVE (trading) days, not calendar days — a day with no
 * trades is a neutral gap, so you are never punished for *not* trading; only a rule break resets it.
 * No DB, no network. The service decides what "disciplined" means per day.
 */
export type DisciplineDay = { date: string; disciplined: boolean }; // date = YYYY-MM-DD

export type DisciplineStreak = {
  currentStreak: number; // consecutive disciplined active days, counting back from the latest
  bestStreak: number; // longest run of consecutive disciplined active days ever
  totalActiveDays: number;
  totalDisciplinedDays: number;
  lastActiveDate: string | null;
  brokeStreakOnLastDay: boolean; // the most recent active day was NOT disciplined
};

export function calculateDisciplineStreak(days: DisciplineDay[]): DisciplineStreak {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const totalActiveDays = sorted.length;
  const totalDisciplinedDays = sorted.filter((d) => d.disciplined).length;

  let best = 0;
  let run = 0;
  for (const d of sorted) {
    if (d.disciplined) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].disciplined) current += 1;
    else break;
  }

  const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  return {
    currentStreak: current,
    bestStreak: best,
    totalActiveDays,
    totalDisciplinedDays,
    lastActiveDate: last ? last.date : null,
    brokeStreakOnLastDay: last ? !last.disciplined : false,
  };
}
