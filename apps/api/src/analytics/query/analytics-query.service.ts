import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  AnalyticsInterval,
  WORKSPACE_TOP_LINKS,
  type AnalyticsSeriesPoint,
  type LinkAnalytics,
  type LinkAnalyticsQuery,
  type WorkspaceAnalytics,
  type WorkspaceAnalyticsQuery,
} from '@url-shortener/contracts/analytics';
import { ApiException } from '../../common/errors/api-exception.js';
import { Clock } from '../clock.js';
import { resolveRange } from './analytics-range.js';
import { AnalyticsRepository, type DayRange } from './analytics.repository.js';
import { toBreakdowns } from './breakdowns.js';
import {
  dailySeries,
  hourlySeries,
  hourlyWindow,
  sumTotals,
} from './series.js';

/** Answers the analytics questions of PRD section 10. */
@Injectable()
export class AnalyticsQueryService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly clock: Clock,
  ) {}

  /** Totals, a series, and a breakdown per dimension for one link. */
  async linkAnalytics(
    workspaceId: string,
    linkId: string,
    query: LinkAnalyticsQuery,
  ): Promise<LinkAnalytics> {
    if (!(await this.repository.linkExists(workspaceId, linkId))) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NotFound,
        'Link not found',
      );
    }
    const range = resolveRange(query, this.clock.now());
    const [daily, ranked] = await Promise.all([
      this.repository.linkDailyCounts(linkId, range),
      this.repository.linkTopValues(linkId, range, query.top),
    ]);
    const series =
      range.interval === AnalyticsInterval.Hour
        ? await this.linkHourlySeries(linkId, range)
        : dailySeries(range, daily);
    return {
      range,
      // Totals and breakdowns always come from the roll-ups, so they agree
      // with each other whichever interval the series uses.
      totals: sumTotals(daily),
      series,
      breakdowns: toBreakdowns(ranked),
    };
  }

  /** Totals, a daily series, and the most-clicked links of a workspace. */
  async workspaceAnalytics(
    workspaceId: string,
    query: WorkspaceAnalyticsQuery,
  ): Promise<WorkspaceAnalytics> {
    const range = resolveRange(query, this.clock.now());
    const [daily, topLinks] = await Promise.all([
      this.repository.workspaceDailyCounts(workspaceId, range),
      this.repository.workspaceTopLinks(
        workspaceId,
        range,
        WORKSPACE_TOP_LINKS,
      ),
    ]);
    return {
      range,
      totals: sumTotals(daily),
      series: dailySeries(range, daily),
      topLinks,
    };
  }

  private async linkHourlySeries(
    linkId: string,
    range: DayRange,
  ): Promise<AnalyticsSeriesPoint[]> {
    const { from, until } = hourlyWindow(range);
    return hourlySeries(
      range,
      await this.repository.linkHourlyClicks(linkId, from, until),
    );
  }
}
