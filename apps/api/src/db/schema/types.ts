import { customType } from 'drizzle-orm/sqlite-core';

export const nocaseText = customType<{ data: string }>({ dataType: () => 'text COLLATE NOCASE' });
