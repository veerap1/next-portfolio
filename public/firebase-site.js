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
function entryHref(entry) { return entry.url ? escapeHtml(entry.url) : "#"; }
function entryActionLabel(entry, fallback) { return entry.url ? fallback : "Saved in Firestore"; }
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
        if (byType.notes.length > 0) notesList.innerHTML = byType.notes.map((entry) => `<article class="card"><span class="tag">${escapeHtml(entry.tag || "Note")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p><a href="${entryHref(entry)}">${entryActionLabel(entry, "Open note")}</a></article>`).join("");
        if (byType.documents.length > 0) documentsList.innerHTML = byType.documents.map((entry) => `<article class="card"><span class="tag">${escapeHtml(entry.tag || "Document")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p><a href="${entryHref(entry)}">${entryActionLabel(entry, "Open document")}</a></article>`).join("");
        if (byType.links.length > 0) linksList.innerHTML = byType.links.map((entry) => `<a class="link-row" href="${entryHref(entry)}" target="_blank" rel="noreferrer"><span>${escapeHtml(entry.title)}</span><span>${escapeHtml(entry.description)}</span></a>`).join("");
        if (byType.projects.length > 0) projectsList.innerHTML = byType.projects.map((entry, index) => `<article class="project-card"><p class="project-index">${String(index + 1).padStart(2, "0")}</p><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p></article>`).join("");
    } catch (error) { console.error(error); }
}
function renderSavedEntries(entries, savedList, canDelete) {
    if (entries.length === 0) {
        savedList.innerHTML = '<p class="empty-state">No saved entries yet. Add your first post above.</p>';
        return;
    }
    savedList.innerHTML = entries.map((entry) => `<article class="saved-card"><div><p class="saved-meta">${escapeHtml(entry.type)}${entry.tag ? " / " + escapeHtml(entry.tag) : ""}</p><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p>${entry.url ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">${escapeHtml(entry.url)}</a>` : ""}</div>${canDelete ? `<button class="button secondary small-button" type="button" data-delete="${entry.id}">Delete</button>` : ""}</article>`).join("");
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
    if (!form || !savedList || !status || !authStatus || !storageNotice || !clearButton || !signInButton || !signOutButton) return;
    if (!hasConfig) { renderSetupNotice(); setEditorEnabled(false); return; }
    storageNotice.textContent = "Firebase Auth + Cloud Firestore mode.";
    setEditorEnabled(false);
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
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!canAttemptWrite(currentUser)) { status.textContent = "Sign in first to attempt saving content."; return; }
        const formData = new FormData(form);
        const entry = {
            type: formData.get("type"),
            tag: String(formData.get("tag") || "").trim(),
            title: String(formData.get("title") || "").trim(),
            description: String(formData.get("description") || "").trim(),
            url: String(formData.get("url") || "").trim(),
            authorEmail: currentUser.email,
        };
        try {
            await createEntry(entry);
            form.reset();
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
