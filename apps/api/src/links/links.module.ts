import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';
import { BlocklistRecheckJob } from './blocklist-recheck.job.js';
import { CodeGenerator } from './code-generator.js';
import { destinationPolicyProvider } from './destination-policy.provider.js';
import { DestinationRiskCheck } from './destination-risk-check.js';
import { LinkChangePublisher } from './link-change-publisher.js';
import { LinkCreationService } from './link-creation.service.js';
import { LinkListService } from './link-list.service.js';
import { LinkPresenter } from './link-presenter.js';
import { LinksController } from './links.controller.js';
import { LinksService } from './links.service.js';
import { VariantsController } from './variants.controller.js';
import { VariantsService } from './variants.service.js';

/** Link and variant management (PRD sections 7 and 11). */
@Module({
  imports: [LinkCacheModule],
  controllers: [LinksController, VariantsController],
  providers: [
    BlocklistRecheckJob,
    CodeGenerator,
    destinationPolicyProvider,
    DestinationRiskCheck,
    LinkChangePublisher,
    LinkCreationService,
    LinkListService,
    LinkPresenter,
    LinksService,
    VariantsService,
  ],
})
export class LinksModule {}
