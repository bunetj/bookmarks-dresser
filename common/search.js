// common/search.js — shared parser, query, matcher, highlighter.
// Used by both se/script.js and ref/search.js.

// ── PARSE FIREFOX BOOKMARKS HTML ──
export function parseBookmarksHTML(html) {
    const bookmarks = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const links = doc.querySelectorAll("a[href]");
    links.forEach(function(a) {
        const title = a.textContent.trim();
        const url = a.getAttribute("href");
        const tagsAttr = a.getAttribute("tags");
        const addDate = a.getAttribute("add_date");
        let tags = [];
        if (tagsAttr) {
            tags = tagsAttr.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; });
        }
        let ancestors = [];
        let dl = a.closest("dl");
        while (dl) {
            let dt = dl.parentElement;
            if (dt && dt.tagName === "DT") {
                for (let i = 0; i < dt.children.length; i++) {
                    if (dt.children[i].tagName === "H3") {
                        ancestors.push(dt.children[i].textContent.trim());
                        break;
                    }
                }
            }
            dl = dl.parentElement ? dl.parentElement.closest("dl") : null;
        }
        ancestors.reverse();
        let folder = ancestors.length > 0
            ? ancestors[ancestors.length - 1]
            : "Unfiled";
        let fullPath = ancestors.length > 0
            ? ancestors.join("/")
            : folder;
        bookmarks.push({
            title: title || "Untitled",
            url: url,
            tags: tags,
            folder: folder,
            full_path: fullPath || folder,
            dateAdded: addDate || "Unknown"
        });
    });
    return bookmarks;
}

// ── PARSE QUERY (returns array of groups; OR within, AND between) ──
function stripQuotes(s) {
    if (typeof s !== 'string') return s;
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
        return s.substring(1, s.length - 1);
    }
    return s;
}

export function parseQuery(query) {
    var rawTokens = [];
    var current = "";
    var prefixBeforeQuote = "";
    var inQuotes = false;

    for (var i = 0; i < query.length; i++) {
        var ch = query[i];
        if (ch === "\"" && (i === 0 || query[i-1] !== "\\")) {
            if (inQuotes) {
                inQuotes = false;
                rawTokens.push(prefixBeforeQuote + '"' + current + '"');
                prefixBeforeQuote = "";
                current = "";
            } else {
                inQuotes = true;
                prefixBeforeQuote = current;
                current = "";
            }
        } else if (ch === " " && !inQuotes) {
            if (current) { rawTokens.push(current); current = ""; }
        } else {
            current += ch;
        }
    }
    if (current) rawTokens.push(current);

    function splitBySlashForOR(token) {
        var isQuoted = token.startsWith('"') && token.endsWith('"');
        if (isQuoted) return [token];
        var lower = token.toLowerCase();
        var neg = lower.startsWith("-");
        var probe = neg ? lower.substring(1) : lower;
        var probeToken = neg ? token.substring(1) : token;
        var isOperator =
            probe.startsWith("name:")   ||
            probe.startsWith("folder:") ||
            probe.startsWith("site:")   ||
            probe.startsWith("date:")   ||
            probe.startsWith("#");
        if (isOperator) {
            var colonIndex = probeToken.indexOf(":");
            var prefix = neg ? "-" : "";
            var operator = "";
            var value = "";
            if (colonIndex !== -1) {
                operator = prefix + probeToken.substring(0, colonIndex + 1);
                value    = probeToken.substring(colonIndex + 1);
            } else {
                operator = prefix + "#";
                value    = probeToken.substring(1);
            }
            if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
                return [token];
            }
            if (value === "" || value.match(/^\/+$/)) {
                return [token];
            }
            if (neg) {
                return [token];
            }
            if (value.includes("/")) {
                var parts = value.split("/");
                var result = [];
                for (var j = 0; j < parts.length; j++) {
                    if (parts[j]) result.push(operator + parts[j]);
                }
                if (result.length === 0) return [token];
                return result;
            }
        }
        if (token.includes("/")) {
            var parts2 = token.split("/");
            var result2 = [];
            for (var j2 = 0; j2 < parts2.length; j2++) {
                if (parts2[j2]) result2.push(parts2[j2]);
            }
            if (result2.length === 0) return [token];
            return result2;
        }
        return [token];
    }

    var groups = [];
    for (var i = 0; i < rawTokens.length; i++) {
        var t = rawTokens[i];
        var groupTokens = splitBySlashForOR(t);
        if (groupTokens.length > 0) groups.push(groupTokens);
    }

    var parsedGroups = [];
    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var parsedTokens = [];
        for (var i = 0; i < group.length; i++) {
            var t = group[i];
            var lower = t.toLowerCase();
            var isQuoted = t.startsWith('"') && t.endsWith('"');
            if (isQuoted) {
                parsedTokens.push({ type: "phrase", value: t.substring(1, t.length - 1).toLowerCase() });
            } else if (lower.startsWith("folder:")) {
                parsedTokens.push({ type: "folder", value: t.substring(7) });
            } else if (lower.startsWith("date:")) {
                parsedTokens.push({ type: "date", value: t.substring(5) });
            } else if (lower.startsWith("site:")) {
                parsedTokens.push({ type: "site", value: t.substring(5) });
            } else if (lower.startsWith("name:")) {
                parsedTokens.push({ type: "name", value: t.substring(5) });
            } else if (t.startsWith("#")) {
                var tagVal = t.substring(1).toLowerCase();
                while (tagVal.startsWith("#")) tagVal = tagVal.substring(1);
                parsedTokens.push({ type: "tag", value: tagVal });
            } else if (t.startsWith("-")) {
                var neg = t.substring(1);
                var negLower = neg.toLowerCase();
                if (neg.startsWith('"') && neg.endsWith('"') && neg.length >= 2) {
                    parsedTokens.push({ type: "exclude", subtype: "phrase",
                        value: neg.substring(1, neg.length - 1).toLowerCase() });
                } else if (negLower.startsWith("folder:")) {
                    parsedTokens.push({ type: "exclude", subtype: "folder",
                        value: stripQuotes(neg.substring(7)).toLowerCase() });
                } else if (negLower.startsWith("date:")) {
                    parsedTokens.push({ type: "exclude", subtype: "date",
                        value: stripQuotes(neg.substring(5)).toLowerCase() });
                } else if (negLower.startsWith("site:")) {
                    parsedTokens.push({ type: "exclude", subtype: "site",
                        value: stripQuotes(neg.substring(5)).toLowerCase() });
                } else if (negLower.startsWith("name:")) {
                    parsedTokens.push({ type: "exclude", subtype: "name",
                        value: stripQuotes(neg.substring(5)).toLowerCase() });
                } else if (neg.startsWith("#")) {
                    var negTag = neg.substring(1).toLowerCase();
                    while (negTag.startsWith("#")) negTag = negTag.substring(1);
                    parsedTokens.push({ type: "exclude", subtype: "tag", value: negTag });
                } else {
                    parsedTokens.push({ type: "exclude", subtype: "text", value: negLower });
                }
            } else {
                parsedTokens.push({ type: "text", value: t.toLowerCase() });
            }
        }
        parsedGroups.push(parsedTokens);
    }
    return parsedGroups;
}

// ── MATCH ──
export function matchBookmark(b, parsedGroups) {
    var searchText = (b.title + " " + b.url + " " + b.full_path + " " + b.folder).toLowerCase();
    var folderText = (b.full_path + " " + b.folder).toLowerCase();
    var urlLower = b.url.toLowerCase();
    var dateText = b.dateAdded.toLowerCase();
    var titleLower = b.title.toLowerCase();
    var bTags = (b.tags || []).map(function(t) {
        t = t.toLowerCase().trim();
        return t.startsWith("#") ? t.substring(1) : t;
    });

    for (var g = 0; g < parsedGroups.length; g++) {
        var group = parsedGroups[g];
        var groupMatched = false;
        for (var i = 0; i < group.length; i++) {
            var p = group[i];
            var tokenMatched = false;
            switch (p.type) {
                case "text":
                    if (searchText.includes(p.value)) tokenMatched = true;
                    break;
                case "phrase":
                    if (searchText.includes(p.value)) tokenMatched = true;
                    break;
                case "folder":
                    if (folderText.includes(p.value.toLowerCase())) tokenMatched = true;
                    break;
                case "date":
                    if (dateText.includes(p.value.toLowerCase())) tokenMatched = true;
                    break;
                case "site":
                    if (urlLower.includes(p.value.toLowerCase())) tokenMatched = true;
                    break;
                case "name":
                    if (titleLower.includes(p.value.toLowerCase())) tokenMatched = true;
                    break;
                case "tag":
                    for (var ti = 0; ti < bTags.length; ti++) {
                        if (bTags[ti].indexOf(p.value) !== -1) { tokenMatched = true; break; }
                    }
                    break;
                case "exclude": {
                    var sub = p.subtype || "text";
                    var negHit;
                    if (sub === "tag") {
                        negHit = false;
                        for (var ti2 = 0; ti2 < bTags.length; ti2++) {
                            if (bTags[ti2].indexOf(p.value) !== -1) { negHit = true; break; }
                        }
                    } else if (sub === "folder") {
                        negHit = folderText.indexOf(p.value) !== -1;
                    } else if (sub === "date") {
                        negHit = dateText.indexOf(p.value) !== -1;
                    } else if (sub === "site") {
                        negHit = urlLower.indexOf(p.value) !== -1;
                    } else if (sub === "name") {
                        negHit = titleLower.indexOf(p.value) !== -1;
                    } else {
                        negHit = searchText.indexOf(p.value) !== -1;
                    }
                    if (!negHit) tokenMatched = true;
                    break;
                }
            }
            if (tokenMatched) { groupMatched = true; break; }
        }
        if (!groupMatched) return false;
    }
    return true;
}

// ── HIGHLIGHT ──
export function highlightText(text, query) {
    if (!query || !text) return text;
    var q = query.toLowerCase();
    var lower = text.toLowerCase();
    if (!lower.includes(q)) return text;
    var idx = lower.indexOf(q);
    return text.slice(0, idx) + "<strong>" + text.slice(idx, idx + q.length) + "</strong>" + text.slice(idx + q.length);
}
