use crate::process::Command;
use crate::state::is_object_id;
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{path::Path, process::Stdio};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

const MAX_TREE_ENTRIES: usize = 10_000;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PackObject {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) size: u64,
    pub(crate) packed_bytes: u64,
    pub(crate) offset: u64,
    pub(crate) references: Vec<String>,
}

pub(crate) async fn inspect_pack(index: &Path) -> Result<(Vec<PackObject>, u64, u64)> {
    let output = Command::new("git")
        .args(["verify-pack", "-v"])
        .arg(index)
        .output()
        .await?;
    if !output.status.success() {
        bail!("git verify-pack rejected the generated index")
    }
    let mut objects = Vec::new();
    let mut expanded = 0_u64;
    let mut largest_blob = 0_u64;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() < 5
            || !is_object_id(fields[0])
            || !matches!(fields[1], "commit" | "tree" | "blob" | "tag")
        {
            continue;
        }
        let size = fields[2].parse::<u64>()?;
        expanded = expanded
            .checked_add(size)
            .context("expanded pack size overflow")?;
        if fields[1] == "blob" {
            largest_blob = largest_blob.max(size);
        }
        objects.push(PackObject {
            id: fields[0].into(),
            kind: fields[1].into(),
            size,
            packed_bytes: fields[3].parse::<u64>()?,
            offset: fields[4].parse::<u64>()?,
            references: Vec::new(),
        });
    }
    Ok((objects, expanded, largest_blob))
}

pub(crate) async fn populate_object_references(
    repository: &Path,
    objects: &mut [PackObject],
) -> Result<()> {
    let structural = objects
        .iter_mut()
        .filter(|object| object.kind != "blob")
        .collect::<Vec<_>>();
    let mut child = Command::new("git")
        .arg("--git-dir")
        .arg(repository)
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    let mut stdin = child.stdin.take().context("open git cat-file stdin")?;
    for object in &structural {
        stdin
            .write_all(format!("{}\n", object.id).as_bytes())
            .await?;
    }
    drop(stdin);
    let mut stdout = BufReader::new(child.stdout.take().context("open git cat-file stdout")?);
    let hash_bytes = structural
        .first()
        .map(|object| object.id.len() / 2)
        .unwrap_or(20);
    for expected in structural {
        let mut header = String::new();
        stdout.read_line(&mut header).await?;
        let fields = header.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 3 || fields[0] != expected.id || fields[1] != expected.kind {
            bail!("git cat-file returned an unexpected object")
        }
        let size = fields[2].parse::<usize>()?;
        let mut content = vec![0; size];
        stdout.read_exact(&mut content).await?;
        let mut newline = [0];
        stdout.read_exact(&mut newline).await?;
        expected.references = object_references(&expected.kind, &content, hash_bytes)?;
    }
    if !child.wait().await?.success() {
        bail!("git cat-file failed while validating the object graph")
    }
    Ok(())
}

fn object_references(kind: &str, content: &[u8], hash_bytes: usize) -> Result<Vec<String>> {
    if kind == "tree" {
        let mut references = Vec::new();
        let mut offset = 0;
        while offset < content.len() {
            let nul = content[offset..]
                .iter()
                .position(|byte| *byte == 0)
                .context("invalid tree entry")?
                + offset;
            offset = nul + 1;
            if offset + hash_bytes > content.len() {
                bail!("truncated tree object")
            }
            references.push(hex::encode(&content[offset..offset + hash_bytes]));
            offset += hash_bytes;
            if references.len() > MAX_TREE_ENTRIES {
                bail!("tree contains more than {MAX_TREE_ENTRIES} entries")
            }
        }
        return Ok(references);
    }
    let text = std::str::from_utf8(content).context("structural Git object is not UTF-8")?;
    let prefixes: &[&str] = match kind {
        "commit" => &["tree ", "parent "],
        "tag" => &["object "],
        _ => &[],
    };
    Ok(text
        .lines()
        .filter_map(|line| prefixes.iter().find_map(|prefix| line.strip_prefix(prefix)))
        .map(str::to_owned)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_commit_and_tag_references() {
        let tree = "a".repeat(40);
        let parent = "b".repeat(40);
        let commit = format!(
            "tree {tree}\nparent {parent}\nauthor Marl <marl@example.com> 0 +0000\n\nmessage\n"
        );
        assert_eq!(
            object_references("commit", commit.as_bytes(), 20).unwrap(),
            vec![tree, parent]
        );
        let target = "c".repeat(40);
        assert_eq!(
            object_references(
                "tag",
                format!("object {target}\ntype commit\n").as_bytes(),
                20
            )
            .unwrap(),
            vec![target]
        );
    }

    #[test]
    fn reads_binary_tree_references_and_rejects_truncation() {
        let object = [7_u8; 20];
        let mut tree = b"100644 file.txt\0".to_vec();
        tree.extend(object);
        assert_eq!(
            object_references("tree", &tree, 20).unwrap(),
            vec![hex::encode(object)]
        );
        tree.pop();
        assert!(object_references("tree", &tree, 20).is_err());
    }
}
