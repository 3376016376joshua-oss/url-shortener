import { Global, Module } from '@nestjs/common';
import { JobScheduler } from './job-scheduler.js';

/** Periodic background jobs, shared by every workstream that needs one. */
@Global()
@Module({
  providers: [JobScheduler],
  exports: [JobScheduler],
})
export class JobsModule {}
