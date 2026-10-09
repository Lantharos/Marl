import { env } from 'cloudflare:workers';
import { createPult, type Pult } from 'pult';
import project from '../../.pult';

let client: Pult | undefined;
let handle: ReturnType<Pult['handler']> | undefined;

export function backoffice() {
  return (client ??= createPult({ key: env.PULT_KEY, url: env.PULT_URL, project }));
}

export function handlePult(request: Request, execution: ExecutionContext) {
  return (handle ??= backoffice().handler())(request, execution);
}
