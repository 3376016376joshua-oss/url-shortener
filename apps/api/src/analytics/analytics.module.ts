import { Module } from '@nestjs/common';
import { ClickRecorder } from './click-recorder.js';
import { Clock } from './clock.js';
import { ClickBatchWriter } from './consumer/click-batch-writer.js';
import { ClickConsumer } from './consumer/click-consumer.js';
import { AnalyticsQueryService } from './query/analytics-query.service.js';
import { AnalyticsController } from './query/analytics.controller.js';
import { AnalyticsRepository } from './query/analytics.repository.js';
import { CountryResolver } from './recorder/country-resolver.js';
import { DailySalts } from './recorder/daily-salts.js';
import { GeoIpCountryResolver } from './recorder/geoip-country-resolver.js';
import { StreamClickRecorder } from './recorder/stream-click-recorder.js';
import { ClickPartitions } from './retention/click-partitions.js';

/**
 * Click analytics (PRD section 10): the recorder the redirect path hands
 * clicks to, the consumer that rolls them up, the partition and retention
 * job, and the query endpoints.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [
    Clock,
    { provide: CountryResolver, useClass: GeoIpCountryResolver },
    DailySalts,
    { provide: ClickRecorder, useClass: StreamClickRecorder },
    ClickBatchWriter,
    ClickConsumer,
    ClickPartitions,
    AnalyticsRepository,
    AnalyticsQueryService,
  ],
  exports: [ClickRecorder],
})
export class AnalyticsModule {}
