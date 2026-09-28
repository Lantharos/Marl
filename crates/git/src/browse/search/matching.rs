use super::{SearchFile, SearchMatch};
use regex::bytes::Regex;

const MAX_SHOWN_LINES: usize = 12;
const MAX_LINE_UNITS: usize = 400;
const LEADING_CONTEXT_UNITS: usize = 80;

struct LineMatch {
    number: usize,
    start: usize,
    end: usize,
    ranges: Vec<(usize, usize)>,
}

pub(super) fn is_binary(content: &[u8]) -> bool {
    content[..content.len().min(8000)].contains(&0)
}

pub(super) fn match_file(
    pattern: &Regex,
    path: String,
    object_id: String,
    content: &[u8],
) -> Option<SearchFile> {
    let mut lines: Vec<LineMatch> = Vec::new();
    let mut match_count = 0;
    let mut number = 1;
    let mut line_start = 0;
    let mut scanned = 0;
    for found in pattern.find_iter(content) {
        if found.start() == found.end() {
            continue;
        }
        for (offset, byte) in content[scanned..found.start()].iter().enumerate() {
            if *byte == b'\n' {
                number += 1;
                line_start = scanned + offset + 1;
            }
        }
        scanned = found.start();
        let line_end = content[line_start..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(content.len(), |position| line_start + position);
        let range = (
            found.start() - line_start,
            found.end().min(line_end) - line_start,
        );
        match lines.last_mut() {
            Some(line) if line.number == number => line.ranges.push(range),
            _ => {
                match_count += 1;
                if lines.len() < MAX_SHOWN_LINES {
                    lines.push(LineMatch {
                        number,
                        start: line_start,
                        end: line_end,
                        ranges: vec![range],
                    });
                }
            }
        }
    }
    if match_count == 0 {
        return None;
    }
    Some(SearchFile {
        path,
        object_id,
        match_count,
        matches: lines
            .into_iter()
            .map(|line| display_line(&content[line.start..line.end], line.number, &line.ranges))
            .collect(),
    })
}

fn display_line(bytes: &[u8], line: usize, ranges: &[(usize, usize)]) -> SearchMatch {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    let Ok(text) = std::str::from_utf8(bytes) else {
        return SearchMatch {
            line,
            text: String::from_utf8_lossy(bytes)
                .chars()
                .take(MAX_LINE_UNITS)
                .collect(),
            ranges: Vec::new(),
        };
    };
    let units = |offset: usize| {
        text.get(..offset.min(text.len()))
            .map_or(0, |prefix| prefix.encode_utf16().count())
    };
    let utf16 = text.encode_utf16().collect::<Vec<_>>();
    let first = ranges.first().map_or(0, |range| units(range.0));
    let window_start = if utf16.len() > MAX_LINE_UNITS {
        first
            .saturating_sub(LEADING_CONTEXT_UNITS)
            .min(utf16.len() - MAX_LINE_UNITS)
    } else {
        0
    };
    let window_end = (window_start + MAX_LINE_UNITS).min(utf16.len());
    SearchMatch {
        line,
        text: String::from_utf16_lossy(&utf16[window_start..window_end]),
        ranges: ranges
            .iter()
            .map(|range| (units(range.0), units(range.1)))
            .filter(|(start, end)| *end > window_start && *start < window_end)
            .map(|(start, end)| {
                [
                    start.max(window_start) - window_start,
                    end.min(window_end) - window_start,
                ]
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::bytes::RegexBuilder;

    #[test]
    fn reports_lines_and_utf16_ranges() {
        let pattern = RegexBuilder::new("needle")
            .case_insensitive(true)
            .build()
            .unwrap();
        let content = "first line\n  é Needle and needle\r\nlast needle".as_bytes();
        let file = match_file(&pattern, "a.txt".into(), "0".repeat(40), content).unwrap();
        assert_eq!(file.match_count, 2);
        assert_eq!(file.matches[0].line, 2);
        assert_eq!(file.matches[0].text, "  é Needle and needle");
        assert_eq!(file.matches[0].ranges, vec![[4, 10], [15, 21]]);
        assert_eq!(file.matches[1].line, 3);
        assert_eq!(file.matches[1].ranges, vec![[5, 11]]);
    }
}
