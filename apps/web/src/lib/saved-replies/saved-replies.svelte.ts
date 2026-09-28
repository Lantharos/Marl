import type { SavedReply } from '@marl/contracts';
import { api } from '$lib/api';

function byTitle(left: SavedReply, right: SavedReply) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
}

class SavedReplies {
  replies = $state<SavedReply[]>([]);
  loaded = $state(false);
  #loading: Promise<void> | null = null;

  load() {
    this.#loading ??= api<{ replies: SavedReply[] }>('/saved-replies').then(
      (result) => {
        this.replies = result.replies;
        this.loaded = true;
      },
      (cause: unknown) => {
        this.#loading = null;
        throw cause;
      }
    );
    return this.#loading;
  }

  seed(replies: SavedReply[]) {
    this.replies = replies;
    this.loaded = true;
    this.#loading = Promise.resolve();
  }

  async create(title: string, body: string) {
    const { reply } = await api<{ reply: SavedReply }>('/saved-replies', {
      method: 'POST',
      body: JSON.stringify({ title, body })
    });
    this.replies = [...this.replies, reply].sort(byTitle);
    return reply;
  }

  async update(id: string, title: string, body: string) {
    const { reply } = await api<{ reply: SavedReply }>(`/saved-replies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, body })
    });
    this.replies = this.replies.map((item) => (item.id === id ? reply : item)).sort(byTitle);
  }

  async remove(id: string) {
    await api(`/saved-replies/${id}`, { method: 'DELETE' });
    this.replies = this.replies.filter((item) => item.id !== id);
  }
}

export const savedReplies = new SavedReplies();
