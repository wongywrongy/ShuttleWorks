import { useAppStore } from '../../store/appStore';
import type { RosterGroupDTO } from '../../api/dto';

interface RankCoverageDashboardProps {
  onEditSchool?: (school: RosterGroupDTO) => void;
}

/**
 * RankCoverageDashboard Component
 *
 * At-a-glance rank assignment coverage grid showing:
 * - Schools × Rank Categories (MS, WS, MD, WD, XD)
 * - Color-coded cells: Green (complete), Yellow (partial), Red (empty)
 * - Coverage totals per school
 */
export function RankCoverageDashboard({ onEditSchool }: RankCoverageDashboardProps) {
  const { config, groups, players } = useAppStore();

  if (!config?.rankCounts || groups.length === 0) {
    return null;
  }

  const rankCategories = ['MS', 'WS', 'MD', 'WD', 'XD'];

  // Calculate coverage for each school and rank category
  const getCoverage = (schoolId: string, rankCategory: string) => {
    const expected = config.rankCounts?.[rankCategory] || 0;
    if (expected === 0) return { filled: 0, expected: 0, percent: 0 };

    // Count how many ranks of this category are assigned to players in this school
    const assignedRanks = new Set<string>();
    players
      .filter(p => p.groupId === schoolId)
      .forEach(p => {
        (p.ranks || []).forEach(rank => {
          if (rank.startsWith(rankCategory)) {
            assignedRanks.add(rank);
          }
        });
      });

    const filled = assignedRanks.size;
    const percent = (filled / expected) * 100;

    return { filled, expected, percent };
  };

  // Get cell styling based on coverage (3 colors only)
  const getCellStyle = (percent: number, expected: number) => {
    if (expected === 0) return 'bg-muted text-muted-foreground';
    if (percent === 100) return 'bg-green-100 text-green-800 font-semibold';
    if (percent > 0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Calculate total coverage for a school
  const getSchoolTotal = (schoolId: string) => {
    let totalFilled = 0;
    let totalExpected = 0;

    rankCategories.forEach(cat => {
      const coverage = getCoverage(schoolId, cat);
      totalFilled += coverage.filled;
      totalExpected += coverage.expected;
    });

    return { filled: totalFilled, expected: totalExpected };
  };

  return (
    <div className="bg-white rounded shadow-sm border border-border overflow-hidden mb-4">
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Rank Coverage</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-200"></span>100%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-200"></span>1-99%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200"></span>0%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/40">
                School
              </th>
              {rankCategories.map(cat => {
                const expected = config.rankCounts?.[cat] || 0;
                return (
                  <th key={cat} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div>{cat}</div>
                    <div className="text-muted-foreground font-normal normal-case mt-0.5">
                      (of {expected})
                    </div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groups.map(school => {
              const schoolTotal = getSchoolTotal(school.id);
              const totalPercent = schoolTotal.expected > 0
                ? (schoolTotal.filled / schoolTotal.expected) * 100
                : 0;

              return (
                <tr key={school.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-sm font-medium text-foreground sticky left-0 bg-white">
                    <button
                      onClick={() => onEditSchool?.(school)}
                      className="hover:text-muted-foreground transition-colors"
                    >
                      {school.name}
                    </button>
                  </td>
                  {rankCategories.map(cat => {
                    const coverage = getCoverage(school.id, cat);
                    const style = getCellStyle(coverage.percent, coverage.expected);

                    return (
                      <td key={cat} className={`px-3 py-2 text-center text-sm ${style}`}>
                        {coverage.expected > 0 ? (
                          <span className="font-semibold">{coverage.filled}/{coverage.expected}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-center text-sm ${
                    totalPercent === 100 ? 'bg-green-100 text-green-800 font-semibold' :
                    totalPercent > 0 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    <span className="font-semibold">{schoolTotal.filled}/{schoolTotal.expected}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
