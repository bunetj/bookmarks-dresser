import { parseBookmarksHTML, parseQuery, matchBookmark, highlightText } from "../common/search.js";

let bookmarks = [];
let filtered = [];
let selectedIndex = -1;

const searchInput = document.getElementById("searchInput");
const resultsDiv = document.getElementById("results");
const statsDiv = document.getElementById("stats");
const countSpan = document.getElementById("count");
const clearBtn = document.getElementById("clearBtn");

async function loadBookmarks() {
    try {
        const response = await fetch("../bookmarks.html");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const html = await response.text();
        bookmarks = parseBookmarksHTML(html);
        countSpan.textContent = bookmarks.length.toLocaleString() + " bookmarks";
        statsDiv.innerHTML = "\ud83d\udcda ";
        statsDiv.appendChild(countSpan);
    } catch (e) {
        console.error("Error:", e);
        statsDiv.textContent = "Could not load bookmarks.html";
        resultsDiv.innerHTML = "";
    }
}

function doSearch() {
    var query = searchInput.value;
    if (!query.trim()) {
        filtered = [];
        resultsDiv.innerHTML = "";
        statsDiv.innerHTML = "\ud83d\udcda ";
        statsDiv.appendChild(countSpan);
        return;
    }

    var parsedGroups = parseQuery(query);
    filtered = bookmarks.filter(function(b) { return matchBookmark(b, parsedGroups); });

    filtered.sort(function(a, b) {
        var dateA = a.dateAdded;
        var dateB = b.dateAdded;
        if (dateA === "Unknown") dateA = "0";
        if (dateB === "Unknown") dateB = "0";
        return parseInt(dateB) - parseInt(dateA);
    });

    renderResults(filtered);
    statsDiv.textContent = filtered.length + " results found ";
}

function renderResults(results) {
    if (results.length === 0) {
        resultsDiv.innerHTML = "<div class=\"no-results\"><div class=\"big\">\ud83d\udd0d</div><p>No bookmarks found</p></div>";
        return;
    }
    var query = searchInput.value;
    var html = "";
    for (var i = 0; i < results.length; i++) {
        var b = results[i];
        var tags = b.tags || [];
        var tagsHtml = "";
        if (tags.length > 0) {
            for (var j = 0; j < tags.length; j++) {
                var t = tags[j];
                var displayTag = t.startsWith("#") ? t.substring(1) : t;
                tagsHtml += "<span class=\"tag-item\">#" + displayTag + "</span>";
            }
        }
        var dateDisplay = b.dateAdded || "Unknown";
        if (dateDisplay !== "Unknown" && !isNaN(dateDisplay) && dateDisplay.length > 8) {
            try {
                var dateObj = new Date(parseInt(dateDisplay) * 1000);
                dateDisplay = dateObj.toISOString().split("T")[0];
            } catch(e) {}
        }
        html += "<div class=\"result\">";
        html += "<div class=\"meta\"><span class=\"folder\">\ud83d\udcc2 " + (b.full_path || b.folder || "Unfiled") + "</span></div>";
        html += "<div class=\"date-line\">\ud83d\udcc5 " + dateDisplay + "</div>";
        html += "<div class=\"url\"><a href=\"" + b.url + "\" target=\"_blank\">" + highlightText(b.url, query) + "</a></div>";
        html += "<div class=\"title\"><a href=\"" + b.url + "\" target=\"_blank\">" + highlightText(b.title, query) + "</a></div>";
        if (tagsHtml) html += "<div class=\"tags-row\">" + tagsHtml + "</div>";
        html += "</div>";
    }
    resultsDiv.innerHTML = html;
    selectedIndex = -1;
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
            clearBtn.style.display = "none";
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            var items = document.querySelectorAll(".result");
            if (items.length) {
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                for (var i = 0; i < items.length; i++) {
                    var el = items[i];
                    el.style.borderColor = (i === selectedIndex) ? "#1a73e8" : "";
                    el.style.background = (i === selectedIndex) ? "#f8f9fa" : "";
                }
            }
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            var items = document.querySelectorAll(".result");
            if (items.length) {
                selectedIndex = Math.max(selectedIndex - 1, 0);
                for (var i = 0; i < items.length; i++) {
                    var el = items[i];
                    el.style.borderColor = (i === selectedIndex) ? "#1a73e8" : "";
                    el.style.background = (i === selectedIndex) ? "#f8f9fa" : "";
                }
            }
        }
        if (e.key === "Enter" && selectedIndex >= 0) {
            var b = filtered[selectedIndex];
            if (b && b.url) window.open(b.url, "_blank");
        }
    }
});

searchInput.addEventListener("input", function() {
    clearBtn.style.display = searchInput.value ? "block" : "none";
});

clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    doSearch();
    searchInput.focus();
    clearBtn.style.display = "none";
});

clearBtn.style.display = "none";

// url-state
(function () {
    var original = doSearch;
    doSearch = function () {
        original.apply(this, arguments);
        var q = searchInput.value.trim();
        var target = q ? "#q=" + encodeURIComponent(q) : "#";
        if (location.hash !== target) history.pushState(null, "", target);
    };
    function restore(q) {
        if (searchInput.value === q) return;
        searchInput.value = q;
        clearBtn.style.display = q ? "block" : "none";
        doSearch();
    }
    window.addEventListener("popstate", function () {
        var m = location.hash.match(/^#q=(.*)$/);
        var q = "";
        if (m) { try { q = decodeURIComponent(m[1]); } catch (e) {} }
        restore(q);
    });
    var tries = 0;
    (function wait() {
        if (bookmarks.length > 0 || tries++ > 100) {
            var m = location.hash.match(/^#q=(.*)$/);
            if (m) {
                var q;
                try { q = decodeURIComponent(m[1]); } catch (e) { q = ""; }
                if (q) restore(q);
            }
            return;
        }
        setTimeout(wait, 50);
    })();
})();

// lucky
document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("luckyBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
        var hasQuery = searchInput.value.trim() !== "";
        var pool = (hasQuery && filtered.length > 0) ? filtered : bookmarks;
        if (!pool || pool.length === 0) return;
        var picks = pool.slice();
        for (var i = picks.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
        }
        filtered = picks.slice(0, 5);
        searchInput.value = "";
        if (clearBtn) clearBtn.style.display = "none";
        renderResults(filtered);
        statsDiv.textContent = "\ud83c\udf40 " + filtered.length + " lucky results";
    });
});

loadBookmarks();
