import { createQualification } from './qualification/environment';
import { qualifyIntegrity } from './qualification/stages/integrity';
import { qualifyPulls } from './qualification/stages/pulls';
import { qualifyReleases } from './qualification/stages/releases';
import { qualifyRuns } from './qualification/stages/runs';
import { setUpRepository } from './qualification/stages/setup';

const qualification = await createQualification();
process.once('SIGINT', () => void qualification.cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => void qualification.cleanup().finally(() => process.exit(143)));

try {
  const repository = await setUpRepository(qualification);
  await qualifyRuns(qualification, repository);
  await qualifyPulls(qualification, repository);
  const release = await qualifyReleases(qualification, repository);
  await qualifyIntegrity(qualification, repository, release);
  console.log(
    `\nMarl qualification passed. Git history, SSH commit signing, PR publication, releases, supersession, restart recovery, and strict clone integrity are healthy.${qualification.skipRunner ? ' Runner execution was explicitly skipped.' : ' Runner execution is healthy.'}`
  );
  console.log(
    `Cloudflare state and repositories were isolated under ${qualification.paths.temporary} and have been removed.`
  );
} catch (error) {
  await qualification.stopServices();
  for (const [name, output] of await qualification.serviceOutput())
    if (output.trim()) console.error(`\n${name} service output:\n${output.trim()}`);
  throw error;
} finally {
  await qualification.cleanup();
}
