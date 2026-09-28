import { parseBookmarksHTML, parseQuery, matchBookmark, highlightText } from "../common/search.js";

let bookmarks = [];
let filtered = [];

const searchInput = document.getElementById("refSearchInput");
const clearBtn = document.getElementById("refClearBtn");
const resultsDiv = document.getElementById("refSearchResults");
const allView = document.getElementById("refAllView");
const statsDiv = document.getElementById("refStats");

async function loadBookmarks() {
    try {
        const response = await fetch("../bookmarks.html");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const html = await response.text();
        bookmarks = parseBookmarksHTML(html);
        if (statsDiv) statsDiv.textContent = bookmarks.length.toLocaleString() + " bookmarks";
    } catch (e) {
        console.error("Error:", e);
        if (statsDiv) statsDiv.textContent = "Could not load bookmarks.html";
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
}

function doSearch() {
    var query = searchInput.value;
    if (!query.trim()) {
        filtered = [];
        resultsDiv.innerHTML = "";
        resultsDiv.style.display = "none";
        allView.style.display = "";
        document.querySelectorAll(".total").forEach(function(el) {
            el.style.display = "";
        });
        if (statsDiv) statsDiv.textContent = bookmarks.length.toLocaleString() + " bookmarks";
        return;
    }

    allView.style.display = "none";
    document.querySelectorAll(".total").forEach(function(el) {
        el.style.display = "none";
    });
    resultsDiv.style.display = "";

    var parsedGroups = parseQuery(query);
    filtered = bookmarks.filter(function(b) { return matchBookmark(b, parsedGroups); });

    filtered.sort(function(a, b) {
        var dateA = a.dateAdded;
        var dateB = b.dateAdded;
        if (dateA === "Unknown") dateA = "0";
        if (dateB === "Unknown") dateB = "0";
        return parseInt(dateB) - parseInt(dateA);
    });

    renderResults(filtered, query);
    if (statsDiv) statsDiv.textContent = filtered.length + " results";
}

function renderResults(results, query) {
    if (results.length === 0) {
        resultsDiv.innerHTML = "<div class=\"no-results\"><div class=\"big\">\ud83d\udd0d</div><p>No bookmarks found</p></div>";
        return;
    }
    var html = "<ol>";
    for (var i = 0; i < results.length; i++) {
        var b = results[i];
        var tags = b.tags || [];
        var tagStr = "";
        if (tags.length > 0) {
            var cleaned = tags.map(function(t) {
                t = t.trim();
                return t.startsWith("#") ? t.substring(1) : t;
            });
            tagStr = " <span class=\"tags\">[" + cleaned.map(function(t) { return "#" + escapeHtml(t); }).join(" ") + "]</span>";
        }
        var dateDisplay = b.dateAdded || "Unknown";
        if (dateDisplay !== "Unknown" && !isNaN(dateDisplay) && dateDisplay.length > 8) {
            try {
                var dateObj = new Date(parseInt(dateDisplay) * 1000);
                dateDisplay = dateObj.toISOString().split("T")[0];
            } catch(e) {}
        }
        var path = b.full_path || b.folder || "Unfiled";
        html += "<li>";
        html += highlightText(escapeHtml(b.title), query);
        html += tagStr;
        html += ". ";
        html += "<span class=\"path\">" + escapeHtml(path.split("/").join(" / ")) + " / </span>";
        html += "<a href=\"" + escapeHtml(b.url) + "\" target=\"_blank\">" + highlightText(escapeHtml(b.url), query) + "</a>";
        html += ".";
        if (dateDisplay && dateDisplay !== "Unknown") {
            html += " <span class=\"accessed\">Accessed: " + escapeHtml(dateDisplay) + "</span>";
        }
        html += "</li>";
    }
    html += "</ol>";
    resultsDiv.innerHTML = html;
}

document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey && e.key === "k") || (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName))) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
    if (e.target === searchInput) {
        if (e.key === "Enter") { e.preventDefault(); doSearch(); }
        if (e.key === "Escape") {
            searchInput.value = "";
            doSearch();
            searchInput.blur();
            if (clearBtn) clearBtn.style.display = "none";
        }
    }
});

if (searchInput) {
    searchInput.addEventListener("input", function() {
        if (clearBtn) clearBtn.style.display = searchInput.value ? "block" : "none";
    });
}

if (clearBtn) {
    clearBtn.style.display = "none";
    clearBtn.addEventListener("click", function() {
        searchInput.value = "";
        doSearch();
        searchInput.focus();
        clearBtn.style.display = "none";
    });
}

loadBookmarks();
