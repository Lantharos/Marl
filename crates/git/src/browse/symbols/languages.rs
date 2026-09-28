use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

const MAX_LINE_BYTES: usize = 500;
const MAX_SYMBOLS_PER_FILE: usize = 1_000;
const RESERVED: &[&str] = &[
    "if", "for", "while", "switch", "return", "else", "new", "delete", "sizeof", "catch",
];

#[derive(Serialize)]
pub(crate) struct Symbol {
    name: String,
    kind: &'static str,
    line: usize,
}

struct Rule {
    pattern: Regex,
    kind: &'static str,
}

struct Language {
    extensions: &'static [&'static str],
    rules: Vec<Rule>,
}

fn rules(definitions: &[(&str, &'static str)]) -> Vec<Rule> {
    definitions
        .iter()
        .map(|(pattern, kind)| Rule {
            pattern: Regex::new(pattern).expect("valid symbol pattern"),
            kind,
        })
        .collect()
}

static LANGUAGES: LazyLock<Vec<Language>> = LazyLock::new(|| {
    vec![
        Language {
            extensions: &["rs"],
            rules: rules(&[
                (
                    r#"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:(?:const|async|unsafe|extern(?:\s+"[^"]*")?)\s+)*fn\s+(?P<name>[A-Za-z_]\w*)"#,
                    "function",
                ),
                (
                    r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?P<kind>struct|enum|trait|union|type|mod)\s+(?P<name>[A-Za-z_]\w*)",
                    "type",
                ),
                (
                    r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+(?:mut\s+)?(?P<name>[A-Z_][A-Z0-9_]*)\s*:",
                    "constant",
                ),
                (r"^\s*macro_rules!\s*(?P<name>[A-Za-z_]\w*)", "macro"),
            ]),
        },
        Language {
            extensions: &[
                "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "vue",
            ],
            rules: rules(&[
                (
                    r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(?P<name>[A-Za-z_$][\w$]*)",
                    "function",
                ),
                (
                    r"^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+(?P<name>[A-Za-z_$][\w$]*)",
                    "class",
                ),
                (
                    r"^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?(?P<kind>interface|type|enum)\s+(?P<name>[A-Za-z_$][\w$]*)",
                    "type",
                ),
                (
                    r"^\s*export\s+(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)",
                    "variable",
                ),
            ]),
        },
        Language {
            extensions: &["py", "pyi"],
            rules: rules(&[
                (r"^\s*(?:async\s+)?def\s+(?P<name>[A-Za-z_]\w*)", "function"),
                (r"^\s*class\s+(?P<name>[A-Za-z_]\w*)", "class"),
            ]),
        },
        Language {
            extensions: &["go"],
            rules: rules(&[
                (
                    r"^func\s+(?:\([^)]*\)\s*)?(?P<name>[A-Za-z_]\w*)",
                    "function",
                ),
                (
                    r"^type\s+(?P<name>[A-Za-z_]\w*)\s+(?P<kind>struct|interface)\b",
                    "type",
                ),
                (r"^type\s+(?P<name>[A-Za-z_]\w*)\b", "type"),
            ]),
        },
        Language {
            extensions: &["java", "kt", "kts", "cs", "scala"],
            rules: rules(&[
                (
                    r"^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|data|open|partial|inner|enum|annotation|value|case)\s+)*(?P<kind>class|interface|enum|record|object|struct|trait)\s+(?P<name>[A-Za-z_]\w*)",
                    "class",
                ),
                (
                    r"^\s*(?:(?:public|private|protected|internal|override|suspend|inline|open|abstract|operator|infix|tailrec)\s+)*(?:fun|def)\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(?P<name>[A-Za-z_]\w*)",
                    "function",
                ),
                (
                    r"^\s*(?:(?:public|private|protected|internal|static|final|abstract|synchronized|override|virtual|async|sealed)\s+)+[\w<>\[\],.?]+(?:\s+[\w<>\[\],.?]+)*?\s+(?P<name>[A-Za-z_]\w*)\s*\(",
                    "method",
                ),
            ]),
        },
        Language {
            extensions: &["rb"],
            rules: rules(&[
                (
                    r"^\s*def\s+(?:self\.)?(?P<name>[A-Za-z_]\w*[?!=]?)",
                    "function",
                ),
                (r"^\s*(?P<kind>class|module)\s+(?P<name>[A-Z]\w*)", "class"),
            ]),
        },
        Language {
            extensions: &["php"],
            rules: rules(&[
                (
                    r"^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(?P<name>[A-Za-z_]\w*)",
                    "function",
                ),
                (
                    r"^\s*(?:(?:abstract|final|readonly)\s+)*(?P<kind>class|interface|trait|enum)\s+(?P<name>[A-Za-z_]\w*)",
                    "class",
                ),
            ]),
        },
        Language {
            extensions: &["swift"],
            rules: rules(&[(
                r"^\s*(?:(?:public|private|internal|fileprivate|open|static|final|override|mutating|@\w+)\s+)*(?P<kind>func|class|struct|enum|protocol|actor)\s+(?P<name>[A-Za-z_]\w*)",
                "function",
            )]),
        },
        Language {
            extensions: &["c", "h", "cc", "cpp", "cxx", "hh", "hpp", "hxx"],
            rules: rules(&[
                (
                    r"^\s*(?:typedef\s+)?(?P<kind>struct|enum|union|class|namespace)\s+(?P<name>[A-Za-z_]\w*)\s*(?:final\s*)?(?:[:{]|$)",
                    "type",
                ),
                (r"^#\s*define\s+(?P<name>[A-Za-z_]\w*)", "macro"),
                (
                    r"^[A-Za-z_][\w:<>,*&\s]*?[\s*&](?P<name>[A-Za-z_][\w:~]*)\s*\([^;]*$",
                    "function",
                ),
            ]),
        },
        Language {
            extensions: &["zig"],
            rules: rules(&[
                (
                    r"^\s*(?:pub\s+)?(?:export\s+)?fn\s+(?P<name>[A-Za-z_]\w*)",
                    "function",
                ),
                (
                    r"^\s*(?:pub\s+)?const\s+(?P<name>[A-Za-z_]\w*)\s*=\s*(?:packed\s+|extern\s+)?(?P<kind>struct|enum|union)",
                    "type",
                ),
            ]),
        },
        Language {
            extensions: &["lua"],
            rules: rules(&[(r"^\s*(?:local\s+)?function\s+(?P<name>[\w.:]+)", "function")]),
        },
        Language {
            extensions: &["sh", "bash", "zsh"],
            rules: rules(&[(
                r"^\s*(?:function\s+)?(?P<name>[A-Za-z_][\w-]*)\s*\(\)",
                "function",
            )]),
        },
    ]
});

pub(crate) fn language_for(path: &str) -> Option<usize> {
    let extension = path.rsplit_once('.')?.1.to_ascii_lowercase();
    LANGUAGES
        .iter()
        .position(|language| language.extensions.contains(&extension.as_str()))
}

fn normalized_kind(keyword: &str, fallback: &'static str) -> &'static str {
    match keyword {
        "func" | "fn" => "function",
        "mod" | "module" | "namespace" => "module",
        "protocol" | "interface" => "interface",
        "record" | "object" | "class" => "class",
        "struct" => "struct",
        "enum" => "enum",
        "trait" => "trait",
        "union" => "union",
        "type" => "type",
        "actor" => "class",
        _ => fallback,
    }
}

pub(crate) fn extract(language: usize, content: &[u8]) -> Vec<Symbol> {
    let rules = &LANGUAGES[language].rules;
    let mut symbols = Vec::new();
    for (index, line) in content.split(|byte| *byte == b'\n').enumerate() {
        if line.len() > MAX_LINE_BYTES || symbols.len() >= MAX_SYMBOLS_PER_FILE {
            continue;
        }
        let Ok(line) = std::str::from_utf8(line) else {
            continue;
        };
        for rule in rules {
            let Some(captures) = rule.pattern.captures(line) else {
                continue;
            };
            let name = &captures["name"];
            if RESERVED.contains(&name) {
                break;
            }
            symbols.push(Symbol {
                name: name.to_owned(),
                kind: captures
                    .name("kind")
                    .map_or(rule.kind, |kind| normalized_kind(kind.as_str(), rule.kind)),
                line: index + 1,
            });
            break;
        }
    }
    symbols
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(path: &str, source: &str) -> Vec<(String, &'static str)> {
        extract(language_for(path).unwrap(), source.as_bytes())
            .into_iter()
            .map(|symbol| (symbol.name, symbol.kind))
            .collect()
    }

    #[test]
    fn finds_definitions_without_call_sites() {
        assert_eq!(
            names(
                "lib.rs",
                "pub(crate) async fn load() {}\npub struct Repo;\nlet value = load();\nimpl Repo {}\nconst LIMIT: usize = 1;"
            ),
            vec![
                ("load".into(), "function"),
                ("Repo".into(), "struct"),
                ("LIMIT".into(), "constant")
            ]
        );
        assert_eq!(
            names(
                "auth.ts",
                "export async function createAuth() {}\nexport type Env = {};\nconst local = 1;\nexport const routes = [];\ncreateAuth();"
            ),
            vec![
                ("createAuth".into(), "function"),
                ("Env".into(), "type"),
                ("routes".into(), "variable")
            ]
        );
    }
}
