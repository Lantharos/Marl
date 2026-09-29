use super::{IndexedChange, IndexedCommit, IndexedEntry};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

pub(super) fn parse_changed_paths(output: &[u8], commits: &[IndexedCommit]) -> Vec<IndexedChange> {
    let positions = commits
        .iter()
        .enumerate()
        .map(|(index, commit)| (commit.id.as_str(), index))
        .collect::<HashMap<_, _>>();
    let mut paths = vec![HashSet::new(); commits.len()];
    let mut current = None;
    let mut tokens = output
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    while let Some(token) = tokens.next() {
        let token = token.strip_prefix(b"\n").unwrap_or(token);
        if token.first() == Some(&b'C') {
            current = std::str::from_utf8(&token[1..])
                .ok()
                .and_then(|id| positions.get(id).copied());
            continue;
        }
        if token.len() != 1 || !token[0].is_ascii_alphabetic() {
            current = None;
            continue;
        }
        let Some(path) = tokens.next() else { break };
        let Some(index) = current else { continue };
        let path = String::from_utf8_lossy(path).replace('\\', "/");
        if path.is_empty() {
            continue;
        }
        paths[index].insert(path.clone());
        let mut ancestor = path.as_str();
        while let Some((parent, _)) = ancestor.rsplit_once('/') {
            paths[index].insert(parent.to_owned());
            ancestor = parent;
        }
    }
    commits
        .iter()
        .zip(paths)
        .map(|(commit, paths)| {
            let mut paths = paths.into_iter().collect::<Vec<_>>();
            paths.sort_unstable();
            IndexedChange {
                commit_id: commit.id.clone(),
                position: commit.position,
                paths,
            }
        })
        .collect()
}

pub(super) fn parse_tree_entries(output: &[u8], tree_id: &str, prefix: &str) -> Vec<IndexedEntry> {
    let mut entries = Vec::new();
    for record in output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let name_path = String::from_utf8_lossy(&record[tab + 1..]);
        let path = if prefix.is_empty() {
            name_path.into_owned()
        } else {
            format!("{prefix}/{name_path}")
        };
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 4 {
            continue;
        }
        let parent_path = Path::new(&path)
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let name = Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        entries.push(IndexedEntry {
            tree_id: tree_id.into(),
            path,
            parent_path,
            name,
            kind: fields[1].into(),
            object_id: fields[2].into(),
            byte_size: fields[3].parse().ok(),
        });
    }
    entries
}

pub(super) fn parse_records(value: &str, fields: usize) -> Vec<Vec<String>> {
    value
        .split('\x1e')
        .filter_map(|record| {
            let values = record
                .trim_start_matches(['\r', '\n'])
                .trim_end_matches(['\r', '\n'])
                .split('\x1f')
                .map(str::to_owned)
                .collect::<Vec<_>>();
            (values.len() == fields).then_some(values)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(id: &str, parents: &[&str], position: usize) -> IndexedCommit {
        IndexedCommit {
            id: id.into(),
            title: String::new(),
            author: String::new(),
            author_email: String::new(),
            authored_at: String::new(),
            tree_id: String::new(),
            parents: parents.iter().map(|parent| (*parent).to_owned()).collect(),
            signature_status: "unverified".into(),
            signature_signer_id: None,
            signature_key_fingerprint: None,
            position,
        }
    }

    #[test]
    fn changed_paths_include_parent_directories() {
        let first = "1111111111111111111111111111111111111111";
        let second = "2222222222222222222222222222222222222222";
        let output = format!("C{first}\0\0\nM\0apps/web/src/app.ts\0C{second}\0\0\nA\0README.md\0");
        let changes = parse_changed_paths(
            output.as_bytes(),
            &[commit(first, &[second], 2), commit(second, &[], 1)],
        );
        assert_eq!(
            changes[0].paths,
            ["apps", "apps/web", "apps/web/src", "apps/web/src/app.ts"]
        );
        assert_eq!(changes[1].paths, ["README.md"]);
        assert_eq!(changes[0].position, 2);
        assert_eq!(changes[1].position, 1);
    }

    #[test]
    fn tree_entries_preserve_the_requested_directory() {
        let tree_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let blob_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let output = format!("100644 blob {blob_id} 12\tapp.ts\0");
        let entries = parse_tree_entries(output.as_bytes(), tree_id, "apps/web");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "apps/web/app.ts");
        assert_eq!(entries[0].parent_path, "apps/web");
        assert_eq!(entries[0].object_id, blob_id);
        assert_eq!(entries[0].byte_size, Some(12));
    }
}
