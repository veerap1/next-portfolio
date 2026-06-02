import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    orderBy,
    query,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let hasConfig = false;
function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}
function normalizeLinks(entry) {
    if (Array.isArray(entry.links) && entry.links.length > 0) {
        return entry.links.filter((link) => link.url);
    }
    if (entry.url) {
        return [
            {
                label: entry.title || "Open link",
                url: entry.url,
            },
        ];
    }
    return [];
}
function describeFirebaseError(error, fallback) {
    const code = error?.code || "";
    if (code === "permission-denied") return "Permission denied by Firestore rules. Publish firestore.rules in Firebase and make sure your email is allowlisted.";
    if (code === "unauthenticated") return "You need to be signed in before Firestore will allow this action.";
    if (code === "not-found") return "Firestore database or collection not found. Make sure you created a Cloud Firestore database in this Firebase project.";
    if (code === "failed-precondition") return "Firestore is not fully set up yet. Create the database first, then try again.";
    if (code === "unavailable") return "Firebase is temporarily unavailable or blocked by network/browser policy. Try again in a moment.";
    if (code) return `${fallback} (${code})`;
    return fallback;
}
function canAttemptWrite(user) { return Boolean(user?.email); }
function getEntriesCollection() { return collection(db, "entries"); }
async function fetchEntries() {
    const entriesQuery = query(getEntriesCollection(), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }));
}
async function createEntry(entry) {
    return addDoc(getEntriesCollection(), { ...entry, createdAt: serverTimestamp() });
}
async function removeEntry(id) { return deleteDoc(doc(db, "entries", id)); }
async function removeAllEntries() {
    const entries = await fetchEntries();
    await Promise.all(entries.map((entry) => removeEntry(entry.id)));
}
function entryActionMarkup(entry, fallback, emptyLabel = "Saved resource") {
    if (entry.url) {
        return `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">${fallback}</a>`;
    }
    return `<span class="saved-label">${emptyLabel}</span>`;
}
function renderSetupNotice() {
    [document.getElementById("storage-notice"), document.getElementById("auth-status"), document.getElementById("form-status")].forEach((node) => {
        if (node) node.textContent = "Add your Firebase project keys in firebase-config.js to enable sign-in and saving.";
    });
}
async function loadFirebaseConfig() {
    const response = await fetch("/api/firebase-config");
    if (!response.ok) {
        throw new Error("Could not load Firebase configuration.");
    }
    const payload = await response.json();
    const firebaseConfig = payload?.firebaseConfig || {};
    hasConfig = Object.values(firebaseConfig).every(
        (value) => typeof value === "string" && value.trim() !== "",
    );
    if (!hasConfig) {
        throw new Error("Firebase environment variables are missing.");
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}
async function renderHomePage() {
    const notesList = document.getElementById("notes-list");
    const documentsList = document.getElementById("documents-list");
    const linksList = document.getElementById("links-list");
    const projectsList = document.getElementById("projects-list");
    if (!notesList || !documentsList || !linksList || !projectsList || !hasConfig) return;
    try {
        const entries = await fetchEntries();
        const byType = {
            notes: entries.filter((entry) => entry.type === "notes"),
            documents: entries.filter((entry) => entry.type === "documents"),
            links: entries.filter((entry) => entry.type === "links"),
            projects: entries.filter((entry) => entry.type === "projects"),
        };
        if (byType.notes.length > 0) notesList.innerHTML = byType.notes.map((entry) => `<article class="card"><span class="tag">${escapeHtml(entry.tag || "Note")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p>${entryActionMarkup(entry, "Open note", "Saved note")}</article>`).join("");
        if (byType.documents.length > 0) documentsList.innerHTML = byType.documents.map((entry) => `<article class="card"><span class="tag">${escapeHtml(entry.tag || "Document")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p>${entryActionMarkup(entry, "Open document", "Saved document")}</article>`).join("");
        if (byType.links.length > 0) {
            linksList.innerHTML = byType.links.map((entry) => {
                const links = normalizeLinks(entry);
                return `<article class="link-row-card">
                    <div>
                        <div class="link-post-title">${escapeHtml(entry.title)}</div>
                        <div>${escapeHtml(entry.description || "")}</div>
                    </div>
                    <div class="link-items">
                        ${links.map((link) => `<div class="link-item"><span>${escapeHtml(link.label || "Link")}</span><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a></div>`).join("")}
                    </div>
                </article>`;
            }).join("");
        }
        if (byType.projects.length > 0) projectsList.innerHTML = byType.projects.map((entry, index) => `<article class="project-card"><p class="project-index">${String(index + 1).padStart(2, "0")}</p><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p></article>`).join("");
    } catch (error) { console.error(error); }
}
function renderSavedEntries(entries, savedList, canDelete) {
    if (entries.length === 0) {
        savedList.innerHTML = '<p class="empty-state">No saved entries yet. Add your first post above.</p>';
        return;
    }
    savedList.innerHTML = entries.map((entry) => {
        const links = entry.type === "links" ? normalizeLinks(entry) : [];
        const linksMarkup = links.length > 0
            ? `<ul>${links.map((link) => `<li><strong>${escapeHtml(link.label || "Link")}:</strong> <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a></li>`).join("")}</ul>`
            : `${entry.url ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">${escapeHtml(entry.url)}</a>` : ""}`;
        return `<article class="saved-card"><div><p class="saved-meta">${escapeHtml(entry.type)}${entry.tag ? " / " + escapeHtml(entry.tag) : ""}</p><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p>${linksMarkup}</div>${canDelete ? `<button class="button secondary small-button" type="button" data-delete="${entry.id}">Delete</button>` : ""}</article>`;
    }).join("");
}
function setEditorEnabled(enabled) {
    const form = document.getElementById("entry-form");
    const clearButton = document.getElementById("clear-all");
    if (!form || !clearButton) return;
    Array.from(form.elements).forEach((element) => { element.disabled = !enabled; });
    clearButton.disabled = !enabled;
}
async function renderWritePage() {
    const form = document.getElementById("entry-form");
    const savedList = document.getElementById("saved-list");
    const status = document.getElementById("form-status");
    const authStatus = document.getElementById("auth-status");
    const storageNotice = document.getElementById("storage-notice");
    const clearButton = document.getElementById("clear-all");
    const signInButton = document.getElementById("sign-in");
    const signOutButton = document.getElementById("sign-out");
    const entryType = document.getElementById("entry-type");
    const singleUrlGroup = document.getElementById("single-url-group");
    const multiUrlGroup = document.getElementById("multi-url-group");
    const addLinkRowButton = document.getElementById("add-link-row");
    const urlRows = document.getElementById("url-rows");
    if (!form || !savedList || !status || !authStatus || !storageNotice || !clearButton || !signInButton || !signOutButton || !entryType || !singleUrlGroup || !multiUrlGroup || !addLinkRowButton || !urlRows) return;
    if (!hasConfig) { renderSetupNotice(); setEditorEnabled(false); return; }
    storageNotice.textContent = "Firebase Auth + Cloud Firestore mode.";
    setEditorEnabled(false);
    const createUrlRow = () => {
        const row = document.createElement("div");
        row.className = "url-row";
        row.innerHTML = `
            <input class="link-label-input" type="text" placeholder="Link title" />
            <input class="link-url-input" type="url" placeholder="https://example.com" />
            <button class="button secondary small-button remove-link-row" type="button">Remove</button>
        `;
        return row;
    };
    const ensureBaseUrlRow = () => {
        if (urlRows.children.length === 0) {
            const row = createUrlRow();
            row.querySelector(".remove-link-row")?.remove();
            urlRows.appendChild(row);
        }
    };
    const toggleLinkMode = () => {
        const isLinks = entryType.value === "links";
        singleUrlGroup.hidden = isLinks;
        multiUrlGroup.hidden = !isLinks;
        const singleUrlInput = document.getElementById("entry-url");
        const descriptionLabel = document.getElementById("entry-description");
        if (singleUrlInput) {
            singleUrlInput.required = false;
        }
        if (descriptionLabel) {
            descriptionLabel.placeholder = isLinks
                ? "Short description for this link post..."
                : "Write a summary, note, or explanation...";
        }
        if (isLinks) {
            ensureBaseUrlRow();
        }
    };
    const refreshSaved = async () => {
        try {
            const entries = await fetchEntries();
            renderSavedEntries(entries, savedList, canAttemptWrite(currentUser));
        } catch (error) {
            savedList.innerHTML = `<p class="empty-state">${escapeHtml(describeFirebaseError(error, "Could not load saved entries."))}</p>`;
        }
    };
    signInButton.addEventListener("click", async () => {
        try { await signInWithPopup(auth, new GoogleAuthProvider()); }
        catch { authStatus.textContent = "Google sign-in failed. Check that Google sign-in is enabled in Firebase Authentication."; }
    });
    signOutButton.addEventListener("click", async () => { await signOut(auth); });
    entryType.addEventListener("change", toggleLinkMode);
    addLinkRowButton.addEventListener("click", () => {
        urlRows.appendChild(createUrlRow());
    });
    urlRows.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.classList.contains("remove-link-row")) return;
        target.closest(".url-row")?.remove();
        ensureBaseUrlRow();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!canAttemptWrite(currentUser)) { status.textContent = "Sign in first to attempt saving content."; return; }
        const formData = new FormData(form);
        const isLinks = formData.get("type") === "links";
        const links = isLinks
            ? Array.from(urlRows.querySelectorAll(".url-row"))
                .map((row) => {
                    const label = row.querySelector(".link-label-input")?.value?.trim() || "";
                    const url = row.querySelector(".link-url-input")?.value?.trim() || "";
                    return { label, url };
                })
                .filter((link) => link.url)
            : [];
        if (isLinks && links.length === 0) {
            status.textContent = "Add at least one URL for a link post.";
            return;
        }
        const entry = {
            type: formData.get("type"),
            tag: String(formData.get("tag") || "").trim(),
            title: String(formData.get("title") || "").trim(),
            description: String(formData.get("description") || "").trim(),
            url: isLinks ? "" : String(formData.get("url") || "").trim(),
            links,
            authorEmail: currentUser.email,
        };
        try {
            await createEntry(entry);
            form.reset();
            urlRows.innerHTML = "";
            ensureBaseUrlRow();
            toggleLinkMode();
            status.textContent = "Entry saved to Firestore.";
            await refreshSaved();
        } catch (error) { status.textContent = describeFirebaseError(error, "Could not save entry."); }
    });
    savedList.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const deleteId = target.getAttribute("data-delete");
        if (!deleteId) return;
        if (!canAttemptWrite(currentUser)) { status.textContent = "Sign in first to attempt deleting content."; return; }
        try {
            await removeEntry(deleteId);
            status.textContent = "Entry deleted.";
            await refreshSaved();
        } catch (error) { status.textContent = describeFirebaseError(error, "Could not delete entry."); }
    });
    clearButton.addEventListener("click", async () => {
        if (!canAttemptWrite(currentUser)) { status.textContent = "Sign in first to attempt clearing content."; return; }
        try {
            await removeAllEntries();
            status.textContent = "All entries removed.";
            await refreshSaved();
        } catch (error) { status.textContent = describeFirebaseError(error, "Could not clear entries."); }
    });
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            authStatus.textContent = "Sign in with your Google account to manage content.";
            signInButton.hidden = false;
            signOutButton.hidden = true;
            setEditorEnabled(false);
            await refreshSaved();
            return;
        }
        if (canAttemptWrite(user)) {
            authStatus.textContent = `Signed in as ${user.email}. Save access still depends on your Firestore rules.`;
            setEditorEnabled(true);
        }
        signInButton.hidden = true;
        signOutButton.hidden = false;
        await refreshSaved();
    });
    ensureBaseUrlRow();
    toggleLinkMode();
}
async function bootstrap() {
    try {
        await loadFirebaseConfig();
    } catch (error) {
        renderSetupNotice();
    }
    renderHomePage();
    renderWritePage();
}

bootstrap();
