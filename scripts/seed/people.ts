import { MarlClient } from '../qualification/client';
import { demoPassword, emailFor, type Person } from './accounts';

export type Member = { person: Person; client: MarlClient; id: string; token: string };

export async function signUp(apiUrl: string, gitUrl: string, workspace: string, person: Person): Promise<Member> {
  const client = new MarlClient(apiUrl, gitUrl, workspace);
  await client.authenticate({
    name: person.name,
    username: person.handle,
    email: emailFor(person),
    password: demoPassword
  });
  await client.request('/api/v1/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: person.name,
      username: person.handle,
      bio: person.bio,
      website: person.website
    })
  });
  const { user } = await client.request<{ user: { id: string } }>('/api/v1/session');
  const { token } = await client.request<{ token: { value: string } }>('/api/v1/tokens', {
    method: 'POST',
    body: JSON.stringify({ name: 'Demo data', scopes: ['repo:read', 'repo:write'], expiresDays: 30 })
  });
  return { person, client, id: user.id, token: token.value };
}
