import { db } from './lib/db';
import { maintenance, runNextJob } from './services/jobs';
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
async function main() {
  const once = process.argv.includes('--once');
  const interval =
    Math.max(60, Number(process.env.WORKER_INTERVAL_SECONDS) || 3600) * 1000;
  while (!stopped) {
    try {
      await maintenance();
      const source = await db.source.findUnique({
        where: { id: 'mock' },
        include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (
        source?.active &&
        (!source.jobs[0] || Date.now() - +source.jobs[0].createdAt >= interval)
      )
        await db.jobRun.create({ data: { sourceId: 'mock' } });
      if (await runNextJob()) {
        if (once) break;
        continue;
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          operation: 'worker',
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (once) {
        process.exitCode = 1;
        break;
      }
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await db.$disconnect();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
