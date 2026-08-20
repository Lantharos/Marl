import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown';

const context = { owner: 'lantharos', repository: 'marl', revision: 'main', path: 'docs/README.md' };

describe('GitHub Flavored Markdown', () => {
  test('renders GFM tables, task lists, and strikethrough', () => {
    const html = renderMarkdown('| State | Value |\n| --- | --- |\n| Done | ~~old~~ |\n\n- [x] shipped');
    expect(html).toContain('<table>');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  test('resolves repository-relative links and images', () => {
    const html = renderMarkdown('[Guide](guide.md#setup)\n\n![Diagram](images/flow.png)', context);
    expect(html).toContain('/lantharos/marl/blob/main/docs/guide.md#setup');
    expect(html).toContain('/api/v1/repositories/lantharos/marl/blob/main/docs/images/flow.png');
  });

  test('sanitizes executable HTML and unsafe URLs', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });
});
