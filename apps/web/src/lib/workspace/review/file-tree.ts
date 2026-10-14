import type { PullRequestDiff } from '@marl/contracts';

export type ChangedFile = PullRequestDiff['files'][number];
export type TreeFolder = { kind: 'folder'; path: string; name: string; children: TreeNode[] };
export type TreeFile = { kind: 'file'; path: string; name: string; file: ChangedFile };
export type TreeNode = TreeFolder | TreeFile;
export type TreeRow = { node: TreeNode; depth: number };

function sortNodes(nodes: TreeNode[]) {
  return nodes.sort((left, right) =>
    left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === 'folder' ? -1 : 1
  );
}

function compress(node: TreeNode): TreeNode {
  if (node.kind === 'file') return node;
  let folder = node;
  while (folder.children.length === 1 && folder.children[0].kind === 'folder') {
    const only = folder.children[0];
    folder = { ...only, name: `${folder.name}/${only.name}` };
  }
  return { ...folder, children: sortNodes(folder.children.map(compress)) };
}

export function buildTree(files: ChangedFile[]): TreeNode[] {
  const root: TreeFolder = { kind: 'folder', path: '', name: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let folder = root;
    for (const [index, name] of parts.slice(0, -1).entries()) {
      const path = parts.slice(0, index + 1).join('/');
      let next = folder.children.find((child): child is TreeFolder => child.kind === 'folder' && child.path === path);
      if (!next) {
        next = { kind: 'folder', path, name, children: [] };
        folder.children.push(next);
      }
      folder = next;
    }
    folder.children.push({ kind: 'file', path: file.path, name: parts.at(-1) ?? file.path, file });
  }
  return sortNodes(root.children.map(compress));
}

export function treeRows(nodes: TreeNode[], collapsed: ReadonlySet<string>, depth = 0): TreeRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.kind === 'folder' && !collapsed.has(node.path) ? treeRows(node.children, collapsed, depth + 1) : [])
  ]);
}

export function fileOrder(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === 'file' ? [node.path] : fileOrder(node.children)));
}
